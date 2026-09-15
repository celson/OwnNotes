/**
 * Key Derivation Functions using HKDF-SHA256 with domain-separated info strings.
 */

import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { encodeUtf8, bytesToHex, hexToBytes, timingSafeEqual } from './utils.js';
import type { DerivedKeys } from './types.js';

export const INFO_VAULT = encodeUtf8('ownnotes-vault-v1');
export const INFO_VERIFIER = encodeUtf8('ownnotes-verifier-v1');
export const INFO_BACKUP = encodeUtf8('ownnotes-backup-v1');
export const INFO_IDENTITY = encodeUtf8('ownnotes-identity-v1');
export const INFO_SYNC_PROOF = encodeUtf8('ownnotes-sync-proof-v1');

const CHALLENGE_MESSAGE = encodeUtf8('ownnotes-vault-challenge-v1');

/**
 * Derives the 32-byte symmetric vault key for XChaCha20-Poly1305.
 */
export function deriveVaultKey(seed: Uint8Array): Uint8Array {
  return hkdf(sha256, seed, undefined, INFO_VAULT, 32);
}

/**
 * Derives the 32-byte key used strictly for challenge verification.
 */
export function deriveVerifierKey(seed: Uint8Array): Uint8Array {
  return hkdf(sha256, seed, undefined, INFO_VERIFIER, 32);
}

/**
 * Derives the 32-byte key used for standalone encrypted backups.
 */
export function deriveBackupKey(seed: Uint8Array): Uint8Array {
  return hkdf(sha256, seed, undefined, INFO_BACKUP, 32);
}

/**
 * Derives a deterministic 32-byte public vault ID (64-char hex string) from the seed.
 * Used as the user's pseudonymous bucket ID on Supabase.
 * Because of HKDF domain separation, knowledge of vaultId reveals zero key material.
 */
export function deriveVaultId(seed: Uint8Array): string {
  const bytes = hkdf(sha256, seed, undefined, INFO_IDENTITY, 32);
  return bytesToHex(bytes);
}

/**
 * Derives a deterministic 32-byte proof-of-ownership secret (64-char hex string) from the seed.
 * Used exclusively to claim/attach a device to a vault_id via the `claim_vault` RPC — it is
 * never used for routing or encryption, and is domain-separated from every other subkey so
 * leaking the vaultId or ciphertext reveals nothing about it.
 */
export function deriveSyncProof(seed: Uint8Array): string {
  const bytes = hkdf(sha256, seed, undefined, INFO_SYNC_PROOF, 32);
  return bytesToHex(bytes);
}

/**
 * Derives all domain-separated subkeys from the 64-byte seed.
 */
export function deriveAllKeys(seed: Uint8Array): DerivedKeys {
  return {
    vaultKey: deriveVaultKey(seed),
    verifierKey: deriveVerifierKey(seed),
    backupKey: deriveBackupKey(seed),
    vaultId: deriveVaultId(seed),
    syncProof: deriveSyncProof(seed),
  };
}

/**
 * Creates an HMAC challenge token to verify if an entered phrase is correct
 * without storing or exposing the encryption key.
 */
export function createVerifierToken(verifierKey: Uint8Array): string {
  const mac = hmac(sha256, verifierKey, CHALLENGE_MESSAGE);
  return bytesToHex(mac);
}

/**
 * Validates a candidate verifier key against a stored verifier token in constant time.
 */
export function checkVerifierToken(verifierKey: Uint8Array, storedTokenHex: string): boolean {
  try {
    const expected = hexToBytes(storedTokenHex);
    const candidate = hmac(sha256, verifierKey, CHALLENGE_MESSAGE);
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}
