import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vaultKeyManager } from '../src/services/vaultKeyManager.js';
import { generatePhrase } from '../src/crypto/mnemonic.js';
import { encryptNote, wipe } from '../src/crypto/index.js';
import {
  createVaultBackupObject,
  validateBackupFile,
  type VaultBackupFileV2,
  type VaultBackupFileV1,
} from '../src/services/backup.js';
import { storageAdapter } from '../src/services/storage/indexedDbAdapter.js';

describe('Vault Encrypted Backup Service', () => {
  const phraseA = generatePhrase();
  const phraseB = generatePhrase();

  beforeEach(() => {
    vaultKeyManager.lock();
    vi.restoreAllMocks();
  });

  it('provides volatile backup key copy when unlocked and wipes on lock', () => {
    expect(() => vaultKeyManager.getBackupKeyCopy()).toThrow('Vault is locked');
    vaultKeyManager.unlock(phraseA);
    const backupKey = vaultKeyManager.getBackupKeyCopy();
    expect(backupKey.length).toBe(32);
    expect(backupKey.some((b) => b !== 0)).toBe(true);

    vaultKeyManager.lock();
    expect(() => vaultKeyManager.getBackupKeyCopy()).toThrow('Vault is locked');
  });

  it('generates a valid v2 signed backup object with HMAC', async () => {
    vaultKeyManager.unlock(phraseA);
    const key = vaultKeyManager.getKeyCopy();
    const mockRecord = encryptNote(
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Secret Note',
        body: 'Confidential text',
        tags: ['test'],
        createdAt: 1000,
        updatedAt: 1000,
      },
      key
    );
    wipe(key);

    vi.spyOn(storageAdapter, 'getAllEncrypted').mockResolvedValue([mockRecord]);

    const backup = await createVaultBackupObject();
    expect(backup.format).toBe('ownnotes-vault-backup');
    expect(backup.version).toBe(2);
    expect(backup.vaultId).toBe(vaultKeyManager.getVaultId());
    expect(backup.recordsCount).toBe(1);
    expect(backup.hmac.length).toBe(64);

    // Validation against current vault must succeed
    const validated = validateBackupFile(backup);
    expect(validated.version).toBe(2);
    expect(validated.records.length).toBe(1);
  });

  it('rejects a v2 backup if content is tampered with', async () => {
    vaultKeyManager.unlock(phraseA);
    const key = vaultKeyManager.getKeyCopy();
    const mockRecord = encryptNote(
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Original Note',
        body: 'Original text',
        tags: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
      key
    );
    wipe(key);

    vi.spyOn(storageAdapter, 'getAllEncrypted').mockResolvedValue([mockRecord]);
    const backup = await createVaultBackupObject();

    // Tamper with record ciphertext
    const tamperedBackup: VaultBackupFileV2 = {
      ...backup,
      records: [
        {
          ...backup.records[0],
          ciphertext: 'tampered-ciphertext-content',
        },
      ],
    };

    expect(() => validateBackupFile(tamperedBackup)).toThrow(/Backup integrity verification failed/);
  });

  it('rejects a v2 backup if vault ID belongs to another vault', async () => {
    vaultKeyManager.unlock(phraseA);
    const key = vaultKeyManager.getKeyCopy();
    const mockRecord = encryptNote(
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Note',
        body: 'Text',
        tags: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
      key
    );
    wipe(key);

    vi.spyOn(storageAdapter, 'getAllEncrypted').mockResolvedValue([mockRecord]);
    const backupA = await createVaultBackupObject();

    // Now switch vault to phrase B
    vaultKeyManager.unlock(phraseB);

    expect(() => validateBackupFile(backupA)).toThrow(/belongs to a different vault/);
  });

  it('accepts a valid v1 legacy backup if decryptable with active key', () => {
    vaultKeyManager.unlock(phraseA);
    const key = vaultKeyManager.getKeyCopy();
    const mockRecord = encryptNote(
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Legacy Note',
        body: 'Legacy body',
        tags: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
      key
    );
    wipe(key);

    const legacyBackup: VaultBackupFileV1 = {
      format: 'ownnotes-vault-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      recordsCount: 1,
      records: [mockRecord],
    };

    const validated = validateBackupFile(legacyBackup);
    expect(validated.version).toBe(1);
    expect(validated.records.length).toBe(1);
  });

  it('rejects a v1 legacy backup if encrypted under a different vault key', () => {
    // Encrypted with Vault B
    vaultKeyManager.unlock(phraseB);
    const keyB = vaultKeyManager.getKeyCopy();
    const mockRecordB = encryptNote(
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Other Note',
        body: 'Other body',
        tags: [],
        createdAt: 1000,
        updatedAt: 1000,
      },
      keyB
    );
    wipe(keyB);

    const legacyBackup: VaultBackupFileV1 = {
      format: 'ownnotes-vault-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      recordsCount: 1,
      records: [mockRecordB],
    };

    // Active vault is Vault A
    vaultKeyManager.unlock(phraseA);

    expect(() => validateBackupFile(legacyBackup)).toThrow(/cannot be decrypted with the active vault key/);
  });
});
