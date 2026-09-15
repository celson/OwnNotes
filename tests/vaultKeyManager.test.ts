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
});
