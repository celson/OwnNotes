import { describe, it, expect } from 'vitest';
import {
  generatePhrase,
  isValidPhrase,
  phraseToSeed,
  deriveAllKeys,
  createVerifierToken,
  checkVerifierToken,
  encryptNote,
  decryptNote,
  encryptBytes,
  decryptBytes,
  wipe,
  bytesToHex,
  encodeUtf8,
  generateUUID,
  normalizePhrase,
  getPhraseValidationDetails,
} from '../src/crypto/index.js';
import type { NoteItem } from '../src/crypto/types.js';

describe('OwnNotes Crypto Core', () => {
  it('generates a valid 12-word BIP-39 mnemonic', () => {
    const phrase = generatePhrase();
    expect(phrase.split(' ').length).toBe(12);
    expect(isValidPhrase(phrase)).toBe(true);
  });

  it('rejects invalid or tampered mnemonic phrases', () => {
    expect(isValidPhrase('')).toBe(false);
    expect(isValidPhrase('one two three four five six seven eight nine ten eleven twelve')).toBe(false);
    // Alter last word
    const valid = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    expect(isValidPhrase(valid)).toBe(true);
    const tampered = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon zoo';
    expect(isValidPhrase(tampered)).toBe(false);
  });

  it('deterministically derives domain-separated keys', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed1 = phraseToSeed(phrase);
    const seed2 = phraseToSeed(phrase);

    const keys1 = deriveAllKeys(seed1);
    const keys2 = deriveAllKeys(seed2);

    expect(bytesToHex(keys1.vaultKey)).toBe(bytesToHex(keys2.vaultKey));
    expect(bytesToHex(keys1.verifierKey)).toBe(bytesToHex(keys2.verifierKey));
    expect(bytesToHex(keys1.backupKey)).toBe(bytesToHex(keys2.backupKey));
    expect(keys1.syncProof).toBe(keys2.syncProof);

    // Domain separation check: keys must be distinct
    expect(bytesToHex(keys1.vaultKey)).not.toBe(bytesToHex(keys1.verifierKey));
    expect(bytesToHex(keys1.vaultKey)).not.toBe(bytesToHex(keys1.backupKey));
    expect(bytesToHex(keys1.verifierKey)).not.toBe(bytesToHex(keys1.backupKey));
    expect(keys1.syncProof).not.toBe(bytesToHex(keys1.vaultKey));
    expect(keys1.syncProof).not.toBe(bytesToHex(keys1.verifierKey));
    expect(keys1.syncProof).not.toBe(bytesToHex(keys1.backupKey));
    expect(keys1.syncProof).not.toBe(keys1.vaultId);

    wipe(seed1);
    wipe(seed2);
  });

  it('validates challenge verifier tokens without exposing keys', () => {
    const phrase = generatePhrase();
    const seed = phraseToSeed(phrase);
    const keys = deriveAllKeys(seed);

    const token = createVerifierToken(keys.verifierKey);
    expect(typeof token).toBe('string');
    expect(token.length).toBe(64); // SHA-256 HMAC in hex

    // Correct key succeeds
    expect(checkVerifierToken(keys.verifierKey, token)).toBe(true);

    // Other key fails
    const otherSeed = phraseToSeed(generatePhrase());
    const otherKeys = deriveAllKeys(otherSeed);
    expect(checkVerifierToken(otherKeys.verifierKey, token)).toBe(false);
  });

  it('encrypts and decrypts notes with authenticated XChaCha20-Poly1305', () => {
    const phrase = generatePhrase();
    const seed = phraseToSeed(phrase);
    const { vaultKey } = deriveAllKeys(seed);

    const sampleNote: NoteItem = {
      id: 'test-note-1',
      title: 'Top Secret Plans',
      body: 'Zero-knowledge encryption is active.',
      tags: ['security', 'crypto'],
      category: 'Work',
      isFavorite: true,
      isPinned: false,
      isTrashed: false,
      createdAt: 1740000000000,
      updatedAt: 1740000050000,
    };

    const encryptedRecord = encryptNote(sampleNote, vaultKey);

    // Ensure metadata is NOT visible in record
    expect(encryptedRecord.id).toBe('test-note-1');
    expect(encryptedRecord.nonce).toBeTruthy();
    expect(encryptedRecord.ciphertext).toBeTruthy();
    expect(JSON.stringify(encryptedRecord)).not.toContain('Top Secret Plans');
    expect(JSON.stringify(encryptedRecord)).not.toContain('Zero-knowledge');

    // Decrypt and verify exact match
    const decrypted = decryptNote(encryptedRecord, vaultKey);
    expect(decrypted.id).toBe(sampleNote.id);
    expect(decrypted.title).toBe(sampleNote.title);
    expect(decrypted.body).toBe(sampleNote.body);
    expect(decrypted.tags).toEqual(sampleNote.tags);
    expect(decrypted.category).toBe(sampleNote.category);
    expect(decrypted.isFavorite).toBe(true);

    wipe(vaultKey);
    wipe(seed);
  });

  it('fails decryption when ciphertext or nonce is tampered with', () => {
    const phrase = generatePhrase();
    const seed = phraseToSeed(phrase);
    const { vaultKey } = deriveAllKeys(seed);

    const original = encodeUtf8('Sensitive payload data');
    const { ciphertext, nonce } = encryptBytes(original, vaultKey);

    // Valid decrypt
    const recovered = decryptBytes(ciphertext, nonce, vaultKey);
    expect(new TextDecoder().decode(recovered)).toBe('Sensitive payload data');

    // Tamper with 1 byte of ciphertext
    const tamperedCiphertext = new Uint8Array(ciphertext);
    tamperedCiphertext[0] ^= 0x01;
    expect(() => decryptBytes(tamperedCiphertext, nonce, vaultKey)).toThrow();

    // Tamper with 1 byte of nonce
    const tamperedNonce = new Uint8Array(nonce);
    tamperedNonce[0] ^= 0x01;
    expect(() => decryptBytes(ciphertext, tamperedNonce, vaultKey)).toThrow();

    // Wrong key
    const wrongKey = new Uint8Array(32);
    wrongKey.fill(42);
    expect(() => decryptBytes(ciphertext, nonce, wrongKey)).toThrow();
  });

  it('securely wipes sensitive memory buffers with zeroes', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5]);
    wipe(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0, 0]);
  });

  it('generates valid RFC4122 v4 UUIDs', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('normalizes phrases with numbering, commas, and formatting', () => {
    const raw = '1. abandon, 2. abandon, 3. abandon, 4. abandon, 5. abandon, 6. abandon, 7. abandon, 8. abandon, 9. abandon, 10. abandon, 11. abandon, 12. about';
    const normalized = normalizePhrase(raw);
    expect(normalized).toBe('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(isValidPhrase(normalized)).toBe(true);
  });

  it('provides detailed phrase validation diagnostics', () => {
    // Valid phrase
    const d1 = getPhraseValidationDetails('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(d1.isValid).toBe(true);
    expect(d1.invalidWords).toEqual([]);
    expect(d1.hasChecksumError).toBe(false);
    expect(d1.wordCount).toBe(12);

    // Typo word
    const d2 = getPhraseValidationDetails('abandon abanndon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
    expect(d2.isValid).toBe(false);
    expect(d2.invalidWords).toEqual(['abanndon']);

    // Checksum error
    const d3 = getPhraseValidationDetails('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon');
    expect(d3.isValid).toBe(false);
    expect(d3.invalidWords).toEqual([]);
    expect(d3.hasChecksumError).toBe(true);
  });
});
