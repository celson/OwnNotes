/**
 * Authenticated Symmetric Encryption using XChaCha20-Poly1305 with random 24-byte nonces.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { encodeUtf8, decodeUtf8, bytesToBase64, base64ToBytes, wipe } from './utils.js';
import type { EncryptedPayload, EncryptedSerializedRecord, NoteItem } from './types.js';

export const NONCE_LENGTH = 24; // 24 bytes for XChaCha20

/**
 * Encrypts arbitrary raw bytes with a 32-byte symmetric key.
 * Automatically generates a secure 24-byte random nonce.
 */
export function encryptBytes(plaintext: Uint8Array, key: Uint8Array): EncryptedPayload {
  if (key.length !== 32) {
    throw new Error('Key must be exactly 32 bytes for XChaCha20-Poly1305');
  }
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = xchacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  return { ciphertext, nonce };
}

/**
 * Decrypts raw ciphertext bytes using a 32-byte symmetric key and 24-byte nonce.
 * Throws an error if key is invalid or data has been tampered with (Poly1305 MAC failure).
 */
export function decryptBytes(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length !== 32) {
    throw new Error('Key must be exactly 32 bytes for XChaCha20-Poly1305');
  }
  if (nonce.length !== NONCE_LENGTH) {
    throw new Error(`Nonce must be exactly ${NONCE_LENGTH} bytes`);
  }
  const cipher = xchacha20poly1305(key, nonce);
  return cipher.decrypt(ciphertext);
}

/**
 * Encrypts a note object into an opaque EncryptedSerializedRecord ready for storage.
 */
export function encryptNote(note: NoteItem, key: Uint8Array): EncryptedSerializedRecord {
  const serialized = JSON.stringify({
    title: note.title,
    body: note.body,
    tags: note.tags || [],
    category: note.category || '',
    isFavorite: !!note.isFavorite,
    isPinned: !!note.isPinned,
    isTrashed: !!note.isTrashed,
  });

  const plaintextBytes = encodeUtf8(serialized);
  const { ciphertext, nonce } = encryptBytes(plaintextBytes, key);
  wipe(plaintextBytes);

  return {
    id: note.id,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(ciphertext),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

/**
 * Decrypts an EncryptedSerializedRecord into a NoteItem.
 * Throws if authentication fails.
 */
export function decryptNote(record: EncryptedSerializedRecord, key: Uint8Array): NoteItem {
  const nonceBytes = base64ToBytes(record.nonce);
  const ciphertextBytes = base64ToBytes(record.ciphertext);

  const decryptedBytes = decryptBytes(ciphertextBytes, nonceBytes, key);
  const decryptedJson = decodeUtf8(decryptedBytes);
  wipe(decryptedBytes);

  const parsed = JSON.parse(decryptedJson);

  return {
    id: record.id,
    title: parsed.title || '',
    body: parsed.body || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    category: parsed.category || '',
    isFavorite: !!parsed.isFavorite,
    isPinned: !!parsed.isPinned,
    isTrashed: !!parsed.isTrashed,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}
