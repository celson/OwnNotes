/**
 * BIP-39 Mnemonic operations: generation, validation, normalization, and seed extraction.
 */

import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeedSync,
} from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { wordlist as portugueseWordlist } from '@scure/bip39/wordlists/portuguese.js';

export const wordlist = englishWordlist;
export const wordlistPt = portugueseWordlist;

/**
 * Generate a new 12-word BIP-39 mnemonic phrase (128 bits of entropy).
 */
export function generatePhrase(): string {
  return generateMnemonic(englishWordlist, 128);
}

/**
 * Normalizes a mnemonic input by stripping numbers (e.g. "1. "), commas, quotes,
 * brackets, invisible unicode characters, and collapsing all whitespace.
 */
export function normalizePhrase(input: string): string {
  if (!input) return '';
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, ' ') // remove zero-width spaces / invisible chars
    .replace(/(?:^|\s+)#?\d+[\.\-\:\)]?\s*/g, ' ') // remove list numbering like "1.", "1)", "#1"
    .replace(/[^a-z]+/gi, ' ') // turn any punctuation or symbols into spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extracts distinct words from any formatted input.
 */
export function extractWords(input: string): string[] {
  const clean = normalizePhrase(input);
  return clean ? clean.split(' ').filter(Boolean) : [];
}

/**
 * Check if a single word is recognized in BIP-39 (English or Portuguese).
 */
export function isBip39Word(word: string): boolean {
  if (!word) return false;
  const w = word.toLowerCase().trim();
  return englishWordlist.includes(w) || portugueseWordlist.includes(w);
}

/**
 * Validate that a phrase is a legitimate BIP-39 mnemonic with a correct checksum.
 * Supports English and Portuguese wordlists.
 */
export function isValidPhrase(phrase: string): boolean {
  if (!phrase) return false;
  const clean = normalizePhrase(phrase);
  return validateMnemonic(clean, englishWordlist) || validateMnemonic(clean, portugueseWordlist);
}

/**
 * Returns any words that are not present in BIP-39 wordlists.
 */
export function getInvalidBip39Words(phrase: string): string[] {
  const words = extractWords(phrase);
  return words.filter((w) => !isBip39Word(w));
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
  const words = extractWords(phrase);
  const cleanPhrase = words.join(' ');
  const invalidWords = words.filter((w) => !isBip39Word(w));

  const isValidEn = words.length === 12 && invalidWords.length === 0 && validateMnemonic(cleanPhrase, englishWordlist);
  const isValidPt = words.length === 12 && invalidWords.length === 0 && validateMnemonic(cleanPhrase, portugueseWordlist);
  const isValid = isValidEn || isValidPt;
  const hasChecksumError = words.length === 12 && invalidWords.length === 0 && !isValid;

  return {
    isValid,
    wordCount: words.length,
    words,
    invalidWords,
    hasChecksumError,
    cleanPhrase,
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
