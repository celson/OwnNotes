import { describe, it, expect } from 'vitest';
import {
  generatePhrase,
  phraseToSeed,
  deriveAllKeys,
  deriveVaultId,
  bytesToHex,
  wipe,
} from '../src/crypto/index.js';

describe('Supabase Vault Identity & Sync Primitives', () => {
  it('deterministically derives a 64-character hex vaultId from mnemonic phrase', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed1 = phraseToSeed(phrase);
    const seed2 = phraseToSeed(phrase);

    const vaultId1 = deriveVaultId(seed1);
    const vaultId2 = deriveVaultId(seed2);

    expect(vaultId1.length).toBe(64); // 32 bytes in hex
    expect(vaultId1).toBe(vaultId2);

    wipe(seed1);
    wipe(seed2);
  });

  it('guarantees cryptographic domain separation between vaultId and keys', () => {
    const phrase = generatePhrase();
    const seed = phraseToSeed(phrase);
    const keys = deriveAllKeys(seed);

    expect(keys.vaultId.length).toBe(64);
    expect(keys.vaultId).not.toBe(bytesToHex(keys.vaultKey));
    expect(keys.vaultId).not.toBe(bytesToHex(keys.verifierKey));
    expect(keys.vaultId).not.toBe(bytesToHex(keys.backupKey));
    expect(keys.vaultId).not.toBe(keys.syncProof);

    wipe(seed);
  });

  it('derives a deterministic, domain-separated sync proof used only to claim vault ownership', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed1 = phraseToSeed(phrase);
    const seed2 = phraseToSeed(phrase);

    const keys1 = deriveAllKeys(seed1);
    const keys2 = deriveAllKeys(seed2);

    expect(keys1.syncProof.length).toBe(64); // 32 bytes in hex
    expect(keys1.syncProof).toBe(keys2.syncProof);
    expect(keys1.syncProof).not.toBe(keys1.vaultId);

    wipe(seed1);
    wipe(seed2);
  });

  it('generates distinct vault IDs for different mnemonic phrases', () => {
    const phrase1 = generatePhrase();
    const phrase2 = generatePhrase();

    const seed1 = phraseToSeed(phrase1);
    const seed2 = phraseToSeed(phrase2);

    const id1 = deriveVaultId(seed1);
    const id2 = deriveVaultId(seed2);

    expect(id1).not.toBe(id2);

    wipe(seed1);
    wipe(seed2);
  });
});
