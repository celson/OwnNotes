/**
 * BIP-39 Mnemonic operations: generation, validation, and seed extraction.
 */

import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

/**
 * Generate a new 12-word BIP-39 mnemonic phrase (128 bits of entropy).
 */
export function generatePhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/**
 * Validate that a phrase is a legitimate BIP-39 mnemonic with a correct checksum.
 */
export function isValidPhrase(phrase: string): boolean {
  if (!phrase) return false;
  const clean = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  return validateMnemonic(clean, wordlist);
}

/**
 * Derives a 64-byte seed from the mnemonic phrase using PBKDF2 (HMAC-SHA512).
 * Note: Returned seed must be wiped when finished with key derivation!
 */
export function phraseToSeed(phrase: string, passphrase = ''): Uint8Array {
  const clean = phrase.trim().toLowerCase().replace(/\s+/g, ' ');
  return mnemonicToSeedSync(clean, passphrase);
}
