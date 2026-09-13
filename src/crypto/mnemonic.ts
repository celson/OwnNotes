/**
 * BIP-39 Mnemonic operations: generation, validation, normalization, and seed extraction.
 */

import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export { wordlist };

/**
 * Generate a new 12-word BIP-39 mnemonic phrase (128 bits of entropy).
 */
export function generatePhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/**
 * Normalizes a mnemonic input by stripping numbers (e.g. "1. "), commas, quotes,
 * brackets, and collapsing all whitespace.
 */
export function normalizePhrase(input: string): string {
  if (!input) return '';
  return input
    .toLowerCase()
    // Remove numbering like "1.", "1 -", "1:", "(1)", "#1"
    .replace(/(?:^|\s+)#?\d+[\.\-\:\)]?\s*/g, ' ')
    // Replace punctuation commonly found when copying or pasting phrases
    .replace(/[,;\"\'\[\]\(\)\{\}\-]/g, ' ')
    // Collapse any whitespace (newlines, tabs, multiple spaces) to a single space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate that a phrase is a legitimate BIP-39 mnemonic with a correct checksum.
 */
export function isValidPhrase(phrase: string): boolean {
  if (!phrase) return false;
  const clean = normalizePhrase(phrase);
  return validateMnemonic(clean, wordlist);
}

/**
 * Returns any words that are not present in the official BIP-39 English wordlist.
 */
export function getInvalidBip39Words(phrase: string): string[] {
  const clean = normalizePhrase(phrase);
  if (!clean) return [];
  const words = clean.split(' ').filter(Boolean);
  return words.filter((w) => !wordlist.includes(w));
}

export interface PhraseValidationDetails {
  isValid: boolean;
  wordCount: number;
  words: string[];
  invalidWords: string[];
  hasChecksumError: boolean;
  cleanPhrase: string;
}

/**
 * Validates phrase and returns detailed diagnostics.
 */
export function getPhraseValidationDetails(phrase: string): PhraseValidationDetails {
  const clean = normalizePhrase(phrase);
  const words = clean ? clean.split(' ').filter(Boolean) : [];
  const invalidWords = words.filter((w) => !wordlist.includes(w));
  const isValid = words.length === 12 && invalidWords.length === 0 && validateMnemonic(clean, wordlist);
  const hasChecksumError = words.length === 12 && invalidWords.length === 0 && !isValid;

  return {
    isValid,
    wordCount: words.length,
    words,
    invalidWords,
    hasChecksumError,
    cleanPhrase: clean,
  };
}

/**
 * Derives a 64-byte seed from the mnemonic phrase using PBKDF2 (HMAC-SHA512).
 * Note: Returned seed must be wiped when finished with key derivation!
 */
export function phraseToSeed(phrase: string, passphrase = ''): Uint8Array {
  const clean = normalizePhrase(phrase);
  return mnemonicToSeedSync(clean, passphrase);
}
