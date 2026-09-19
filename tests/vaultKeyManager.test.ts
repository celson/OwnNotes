import { describe, it, expect, beforeEach } from 'vitest';
import { vaultKeyManager } from '../src/services/vaultKeyManager.js';
import { generatePhrase } from '../src/crypto/mnemonic.js';

describe('VaultKeyManager Security Lifecycle', () => {
  beforeEach(() => {
    vaultKeyManager.lock();
  });

  it('starts locked with no key in memory', () => {
    expect(vaultKeyManager.isUnlocked()).toBe(false);
    expect(() => vaultKeyManager.getKeyCopy()).toThrow('Vault is locked');
  });

  it('unlocks with a valid phrase and provides volatile key copy', () => {
    const phrase = generatePhrase();
    const { verifierKey, syncProof } = vaultKeyManager.unlock(phrase);

    expect(vaultKeyManager.isUnlocked()).toBe(true);
    expect(verifierKey.length).toBe(32);
    expect(syncProof.length).toBe(64);
    expect(vaultKeyManager.getSyncProof()).toBe(syncProof);

    const keyCopy = vaultKeyManager.getKeyCopy();
    expect(keyCopy.length).toBe(32);
    expect(keyCopy.some((b) => b !== 0)).toBe(true);
  });

  it('locks immediately, wipes volatile key memory and triggers listeners', () => {
    const phrase = generatePhrase();
    vaultKeyManager.unlock(phrase);

    let lockNotified = false;
    const unsubscribe = vaultKeyManager.onLock(() => {
      lockNotified = true;
    });

    vaultKeyManager.lock();

    expect(vaultKeyManager.isUnlocked()).toBe(false);
    expect(lockNotified).toBe(true);
    expect(() => vaultKeyManager.getKeyCopy()).toThrow('Vault is locked');
    expect(vaultKeyManager.getSyncProof()).toBeNull();

    unsubscribe();
  });

  it('tracks remaining auto-lock seconds when unlocked and resets to 0 on lock', () => {
    expect(vaultKeyManager.getRemainingSeconds()).toBe(0);

    const phrase = generatePhrase();
    vaultKeyManager.unlock(phrase);

    const remaining = vaultKeyManager.getRemainingSeconds();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(vaultKeyManager.getAutoLockMinutes() * 60);

    vaultKeyManager.lock();
    expect(vaultKeyManager.getRemainingSeconds()).toBe(0);
  });

  it('notifies onActivity when timer resets', () => {
    const phrase = generatePhrase();
    vaultKeyManager.unlock(phrase);

    let activityCount = 0;
    const unsub = vaultKeyManager.onActivity(() => {
      activityCount++;
    });

    vaultKeyManager.resetAutoLockTimer(true);
    expect(activityCount).toBe(1);

    unsub();
  });
});

describe('formatAutoLockTime', () => {
  it('formats countdown times correctly', async () => {
    const { formatAutoLockTime } = await import('../src/services/vaultKeyManager.js');

    expect(formatAutoLockTime(900)).toBe('15m 00s');
    expect(formatAutoLockTime(899)).toBe('14m 59s');
    expect(formatAutoLockTime(65)).toBe('1m 05s');
    expect(formatAutoLockTime(60)).toBe('1m 00s');
    expect(formatAutoLockTime(59)).toBe('59s');
    expect(formatAutoLockTime(1)).toBe('1s');
    expect(formatAutoLockTime(0)).toBe('0s');
    expect(formatAutoLockTime(-10)).toBe('0s');
  });
});
