/**
 * Storage Layer: Encrypted IndexedDB persistence via Dexie.
 *
 * Security Invariants:
 * 1. The `records` table stores only opaque ciphertext, 24-byte nonces, and IDs.
 * 2. NO plaintext titles, tags, or contents are stored in database columns.
 * 3. The `meta` table stores only the one-way HMAC challenge verifier token to confirm phrase match.
 * 4. NO keys, seeds, or passphrases are EVER stored here.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { EncryptedSerializedRecord } from '../../crypto/types.js';

interface MetaEntry {
  key: string;
  value: string;
}

class OwnNotesDatabase extends Dexie {
  records!: EntityTable<EncryptedSerializedRecord, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor() {
    super('OwnNotesVaultDB');
    this.version(1).stores({
      records: 'id, createdAt, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new OwnNotesDatabase();

export class IndexedDbAdapter {
  /**
   * Initializes vault with the one-way HMAC verifier challenge token.
   */
  async initVault(verifierToken: string): Promise<void> {
    await db.meta.put({ key: 'verifierToken', value: verifierToken });
    await db.meta.put({ key: 'vaultCreatedAt', value: String(Date.now()) });
    await db.meta.put({ key: 'schemaVersion', value: '1' });
  }

  /**
   * Retrieves the stored challenge token to verify candidate passphrases.
   */
  async getVerifierToken(): Promise<string | null> {
    const entry = await db.meta.get('verifierToken');
    return entry ? entry.value : null;
  }

  /**
   * Check if a vault already exists on this machine.
   */
  async hasExistingVault(): Promise<boolean> {
    const token = await this.getVerifierToken();
    return token !== null;
  }

  /**
   * Fetches all encrypted records from local storage.
   */
  async getAllEncrypted(): Promise<EncryptedSerializedRecord[]> {
    return db.records.toArray();
  }

  /**
   * Saves or updates an encrypted record.
   */
  async saveEncrypted(record: EncryptedSerializedRecord): Promise<void> {
    await db.records.put(record);
  }

  /**
   * Deletes an encrypted record by ID.
   */
  async deleteEncrypted(id: string): Promise<void> {
    await db.records.delete(id);
  }

  /**
   * Clears all encrypted data and metadata from this device (complete purge).
   */
  async resetVault(): Promise<void> {
    await db.records.clear();
    await db.meta.clear();
  }
}

export const storageAdapter = new IndexedDbAdapter();
