/**
 * Vault Encrypted Backup and Restore Service.
 */

import { storageAdapter } from './storage/indexedDbAdapter.js';
import type { EncryptedSerializedRecord } from '../crypto/types.js';

export interface VaultBackupFile {
  format: 'ownnotes-vault-backup';
  version: number;
  exportedAt: string;
  recordsCount: number;
  records: EncryptedSerializedRecord[];
}

/**
 * Exports all encrypted records into a JSON backup file for download.
 * Notice: Records in the file remain completely encrypted under the user's key!
 */
export async function exportVaultBackup(): Promise<void> {
  const records = await storageAdapter.getAllEncrypted();
  const backup: VaultBackupFile = {
    format: 'ownnotes-vault-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    recordsCount: records.length,
    records,
  };

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
 * Imports records from a backup JSON file into the current vault.
 */
export async function importVaultBackup(
  fileContent: string
): Promise<{ imported: number }> {
  const parsed = JSON.parse(fileContent) as Partial<VaultBackupFile>;

  if (parsed.format !== 'ownnotes-vault-backup' || !Array.isArray(parsed.records)) {
    throw new Error('Invalid OwnNotes backup file format');
  }

  let count = 0;
  for (const record of parsed.records) {
    if (record.id && record.nonce && record.ciphertext) {
      await storageAdapter.saveEncrypted(record);
      count++;
    }
  }

  return { imported: count };
}
