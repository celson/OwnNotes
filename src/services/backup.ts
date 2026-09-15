/**
 * Vault Encrypted Backup and Restore Service.
 *
 * Implements Format v2 with HMAC-SHA256 integrity checks using the user's
 * HKDF-derived backup key (`ownnotes-backup-v1`).
 */

import { storageAdapter } from './storage/indexedDbAdapter.js';
import { vaultKeyManager } from './vaultKeyManager.js';
import {
  wipe,
  encodeUtf8,
  bytesToHex,
  hexToBytes,
  timingSafeEqual,
  computeHmacSha256,
  decryptNote,
} from '../crypto/index.js';
import type { EncryptedSerializedRecord } from '../crypto/types.js';

export interface VaultBackupFileV1 {
  format: 'ownnotes-vault-backup';
  version?: 1;
  exportedAt: string;
  recordsCount: number;
  records: EncryptedSerializedRecord[];
}

export interface VaultBackupFileV2 {
  format: 'ownnotes-vault-backup';
  version: 2;
  vaultId: string;
  exportedAt: string;
  recordsCount: number;
  records: EncryptedSerializedRecord[];
  hmac: string;
}

export type VaultBackupFile = VaultBackupFileV1 | VaultBackupFileV2;

/**
 * Computes canonical payload string for HMAC computation.
 */
export function getBackupCanonicalString(
  vaultId: string,
  exportedAt: string,
  records: EncryptedSerializedRecord[]
): string {
  const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    format: 'ownnotes-vault-backup',
    version: 2,
    vaultId,
    exportedAt,
    records: sorted,
  });
}

/**
 * Creates the signed backup object for the current vault.
 */
export async function createVaultBackupObject(): Promise<VaultBackupFileV2> {
  if (!vaultKeyManager.isUnlocked()) {
    throw new Error('Vault is locked. Unlock vault to export backup.');
  }

  const vaultId = vaultKeyManager.getVaultId();
  if (!vaultId) {
    throw new Error('No active vault ID found.');
  }

  const records = await storageAdapter.getAllEncrypted();
  const sortedRecords = [...records].sort((a, b) => a.id.localeCompare(b.id));
  const exportedAt = new Date().toISOString();

  const canonicalString = getBackupCanonicalString(vaultId, exportedAt, sortedRecords);
  const backupKey = vaultKeyManager.getBackupKeyCopy();

  try {
    const mac = computeHmacSha256(backupKey, encodeUtf8(canonicalString));
    const hmacHex = bytesToHex(mac);

    return {
      format: 'ownnotes-vault-backup',
      version: 2,
      vaultId,
      exportedAt,
      recordsCount: sortedRecords.length,
      records: sortedRecords,
      hmac: hmacHex,
    };
  } finally {
    wipe(backupKey);
  }
}

/**
 * Exports all encrypted records into a signed JSON backup file for download.
 * Notice: Records in the file remain completely encrypted under the user's key!
 */
export async function exportVaultBackup(): Promise<void> {
  const backup = await createVaultBackupObject();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ownnotes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Validates a parsed backup object against the active vault keys and checks integrity.
 */
export function validateBackupFile(backup: Partial<VaultBackupFile>): { records: EncryptedSerializedRecord[]; version: number } {
  if (backup.format !== 'ownnotes-vault-backup' || !Array.isArray(backup.records)) {
    throw new Error('Invalid OwnNotes backup file format');
  }

  if (!vaultKeyManager.isUnlocked()) {
    throw new Error('Vault must be unlocked to import backup.');
  }

  if (backup.version === 2) {
    const v2 = backup as Partial<VaultBackupFileV2>;
    if (!v2.vaultId || !v2.exportedAt || !v2.hmac || !Array.isArray(v2.records)) {
      throw new Error('Malformed v2 backup: missing vaultId, exportedAt, hmac, or records');
    }

    const currentVaultId = vaultKeyManager.getVaultId();
    if (v2.vaultId !== currentVaultId) {
      throw new Error('This backup belongs to a different vault (vault ID mismatch).');
    }

    const canonicalString = getBackupCanonicalString(v2.vaultId, v2.exportedAt, v2.records);
    const backupKey = vaultKeyManager.getBackupKeyCopy();
    try {
      const computedMac = computeHmacSha256(backupKey, encodeUtf8(canonicalString));
      const expectedMac = hexToBytes(v2.hmac);
      if (!timingSafeEqual(computedMac, expectedMac)) {
        throw new Error('Backup integrity verification failed: invalid HMAC or corrupted file.');
      }
    } finally {
      wipe(backupKey);
    }

    return { records: v2.records, version: 2 };
  }

  // Version 1 / legacy format: test decrypt first record if present
  if (backup.records.length > 0) {
    const testRecord = backup.records[0];
    if (testRecord.ciphertext && testRecord.nonce) {
      const key = vaultKeyManager.getKeyCopy();
      try {
        decryptNote(testRecord, key);
      } catch {
        throw new Error('Legacy backup records cannot be decrypted with the active vault key.');
      } finally {
        wipe(key);
      }
    }
  }

  return { records: backup.records, version: 1 };
}

/**
 * Imports records from a backup JSON file into the current vault.
 */
export async function importVaultBackup(
  fileContent: string
): Promise<{ imported: number; version: number }> {
  let parsed: Partial<VaultBackupFile>;
  try {
    parsed = JSON.parse(fileContent) as Partial<VaultBackupFile>;
  } catch {
    throw new Error('Failed to parse backup file as valid JSON.');
  }

  const { records, version } = validateBackupFile(parsed);

  let count = 0;
  for (const record of records) {
    if (record.id && record.nonce && record.ciphertext) {
      await storageAdapter.saveEncrypted(record);
      count++;
    }
  }

  return { imported: count, version };
}
