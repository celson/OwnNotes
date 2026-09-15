/**
 * Vault Key Manager: Manages in-memory key lifecycle with zero persistence.
 *
 * Security Invariants:
 * 1. The key is kept strictly in volatile memory (RAM).
 * 2. It is NEVER written to localStorage, sessionStorage, IndexedDB, cookies, or any storage.
 * 3. On lock or unload, the key buffer is wiped with zeroes (`fill(0)`).
 */

import { phraseToSeed, deriveAllKeys, wipe } from '../crypto/index.js';

type Listener = () => void;

class VaultKeyManager {
  private activeVaultKey: Uint8Array | null = null;
  private activeVaultId: string | null = null;
  private activeSyncProof: string | null = null;
  private autoLockMinutes = 15; // default: 15 minutes
  private autoLockTimer: ReturnType<typeof setTimeout> | null = null;
  private lockListeners = new Set<Listener>();
  private unlockListeners = new Set<Listener>();

  constructor() {
    this.setupInactivityListeners();
    this.setupLifecycleGuards();
  }

  /**
   * Unlock the vault with the 12-word mnemonic phrase.
   * Derives keys in memory and immediately sanitizes the seed.
   */
  public unlock(phrase: string): { verifierKey: Uint8Array; backupKey: Uint8Array; vaultId: string; syncProof: string } {
    this.lock(); // clear previous state if any

    const seed = phraseToSeed(phrase);
    const keys = deriveAllKeys(seed);

    this.activeVaultKey = keys.vaultKey;
    this.activeVaultId = keys.vaultId;
    this.activeSyncProof = keys.syncProof;

    // Zero the temporary seed memory buffer immediately
    wipe(seed);

    this.resetAutoLockTimer();
    this.notifyUnlock();

    return {
      verifierKey: keys.verifierKey,
      backupKey: keys.backupKey,
      vaultId: keys.vaultId,
      syncProof: keys.syncProof,
    };
  }

  /**
   * Immediately clears and zeroes the vault key in memory.
   */
  public lock(): void {
    if (this.activeVaultKey) {
      wipe(this.activeVaultKey);
      this.activeVaultKey = null;
    }
    this.activeVaultId = null;
    this.activeSyncProof = null;
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    this.notifyLock();
  }

  /**
   * Check if the vault is currently unlocked and key is present.
   */
  public isUnlocked(): boolean {
    return this.activeVaultKey !== null && this.activeVaultKey.some((b) => b !== 0);
  }

  /**
   * Returns the current public vaultId (pseudonymous bucket ID for Supabase sync).
   */
  public getVaultId(): string | null {
    return this.activeVaultId;
  }

  /**
   * Returns the current sync proof: a deterministic secret used solely to claim/attach
   * this device to the active vault_id via the `claim_vault` RPC. Never used for
   * encryption or routing, and domain-separated from the vault key and vault ID.
   */
  public getSyncProof(): string | null {
    return this.activeSyncProof;
  }

  /**
   * Returns a temporary defensive copy of the active vault key.
   * Callers must wipe their copy once finished with the operation.
   */
  public getKeyCopy(): Uint8Array {
    if (!this.isUnlocked() || !this.activeVaultKey) {
      throw new Error('Vault is locked. No encryption key available in memory.');
    }
    return new Uint8Array(this.activeVaultKey);
  }

  public getAutoLockMinutes(): number {
    return this.autoLockMinutes;
  }

  public setAutoLockMinutes(mins: number): void {
    this.autoLockMinutes = mins;
    this.resetAutoLockTimer();
  }

  public onLock(cb: Listener): () => void {
    this.lockListeners.add(cb);
    return () => this.lockListeners.delete(cb);
  }

  public onUnlock(cb: Listener): () => void {
    this.unlockListeners.add(cb);
    return () => this.unlockListeners.delete(cb);
  }

  private notifyLock(): void {
    for (const cb of this.lockListeners) {
      try {
        cb();
      } catch (err) {
        console.error('Lock listener error:', err);
      }
    }
  }

  private notifyUnlock(): void {
    for (const cb of this.unlockListeners) {
      try {
        cb();
      } catch (err) {
        console.error('Unlock listener error:', err);
      }
    }
  }

  /**
   * Resets the auto-lock countdown timer on user activity.
   */
  public resetAutoLockTimer(): void {
    if (this.autoLockTimer) {
      clearTimeout(this.autoLockTimer);
      this.autoLockTimer = null;
    }

    if (!this.isUnlocked() || this.autoLockMinutes <= 0) return;

    this.autoLockTimer = setTimeout(() => {
      console.info('Auto-lock triggered by inactivity timeout');
      this.lock();
    }, this.autoLockMinutes * 60 * 1000);
  }

  private setupInactivityListeners(): void {
    if (typeof window === 'undefined') return;

    const activityEvents = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    const onActivity = () => {
      if (this.isUnlocked()) {
        this.resetAutoLockTimer();
      }
    };

    for (const ev of activityEvents) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
  }

  private setupLifecycleGuards(): void {
    if (typeof window === 'undefined') return;

    // Zero memory on tab close, navigate, or background
    window.addEventListener('beforeunload', () => {
      this.lock();
    });

    window.addEventListener('pagehide', () => {
      this.lock();
    });
  }
}

export const vaultKeyManager = new VaultKeyManager();
