/**
 * Supabase Zero-Knowledge Sync Service.
 *
 * Security Invariants:
 * 1. ONLY encrypted payloads (ciphertext + 24-byte nonce) are sent to Supabase.
 * 2. The vault encryption key NEVER leaves the local machine.
 * 3. The vault_id is a deterministic public pseudonym derived via HKDF-SHA256,
 *    mathematically independent of the vault encryption key.
 */

import { getSupabaseClient } from './client.js';
import { vaultKeyManager } from '../vaultKeyManager.js';
import { storageAdapter } from '../storage/indexedDbAdapter.js';
import type { EncryptedSerializedRecord, SupabaseNoteRow } from '../../crypto/types.js';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'not_configured';

class SupabaseSyncService {
  private syncStatus: SyncStatus = 'idle';
  private lastError: string | null = null;
  private statusListeners = new Set<(status: SyncStatus) => void>();
  private activeChannel: ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']> | null = null;

  public getStatus(): SyncStatus {
    return this.syncStatus;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public onStatusChange(cb: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(status: SyncStatus, error: string | null = null): void {
    this.syncStatus = status;
    this.lastError = error;
    for (const cb of this.statusListeners) {
      try {
        cb(status);
      } catch (err) {
        console.error('Sync status listener error:', err);
      }
    }
  }

  /**
   * Tests the Supabase connection and verifies the ownnotes_records table exists.
   */
  public async testConnection(): Promise<{ success: boolean; message: string }> {
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, message: 'Supabase URL or Anon Key is missing.' };
    }

    try {
      const { error } = await client.from('ownnotes_records').select('id').limit(1);
      if (error) {
        if (error.code === '42P01' || error.message.includes('relation "public.ownnotes_records" does not exist')) {
          return {
            success: false,
            message: 'Connected to Supabase, but the "ownnotes_records" table was not found. Please run the SQL schema in your Supabase SQL Editor.',
          };
        }
        return { success: false, message: error.message };
      }
      return { success: true, message: 'Successfully connected to Supabase vault table!' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Connection failed: ${msg}` };
    }
  }

  /**
   * Pushes a single encrypted note record to Supabase.
   */
  public async pushRecord(record: EncryptedSerializedRecord, isDeleted = false): Promise<void> {
    const client = getSupabaseClient();
    const vaultId = vaultKeyManager.getVaultId();

    if (!client || !vaultId) return;

    try {
      const row: SupabaseNoteRow = {
        id: record.id,
        vault_id: vaultId,
        nonce: record.nonce,
        ciphertext: record.ciphertext,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        is_deleted: isDeleted,
      };

      const { error } = await client.from('ownnotes_records').upsert(row);
      if (error) {
        console.error('Supabase push error:', error);
        this.setStatus('error', error.message);
      }
    } catch (err: unknown) {
      console.error('Failed to push note to Supabase:', err);
    }
  }

  /**
   * Full bi-directional sync: pushes local pending records and pulls remote updates.
   */
  public async syncAll(onRemoteChanges?: () => void): Promise<void> {
    const client = getSupabaseClient();
    const vaultId = vaultKeyManager.getVaultId();

    if (!client || !vaultId) {
      this.setStatus('not_configured');
      return;
    }

    this.setStatus('syncing');

    try {
      // 1. Fetch all remote records for this vault
      const { data: remoteRows, error } = await client
        .from('ownnotes_records')
        .select('*')
        .eq('vault_id', vaultId);

      if (error) {
        this.setStatus('error', error.message);
        return;
      }

      // 2. Fetch all local encrypted records
      const localRecords = await storageAdapter.getAllEncrypted();
      const localMap = new Map<string, EncryptedSerializedRecord>();
      for (const rec of localRecords) {
        localMap.set(rec.id, rec);
      }

      let hasChanges = false;

      // 3. Process remote rows into local database
      if (remoteRows && remoteRows.length > 0) {
        for (const r of remoteRows as SupabaseNoteRow[]) {
          const local = localMap.get(r.id);

          if (r.is_deleted) {
            if (local) {
              await storageAdapter.deleteEncrypted(r.id);
              hasChanges = true;
            }
          } else {
            if (!local || r.updated_at > local.updatedAt) {
              await storageAdapter.saveEncrypted({
                id: r.id,
                nonce: r.nonce,
                ciphertext: r.ciphertext,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
              });
              hasChanges = true;
            }
          }
        }
      }

      // 4. Push any local records that don't exist on server or are newer
      const remoteMap = new Map<string, SupabaseNoteRow>();
      if (remoteRows) {
        for (const r of remoteRows as SupabaseNoteRow[]) {
          remoteMap.set(r.id, r);
        }
      }

      const rowsToPush: SupabaseNoteRow[] = [];
      for (const local of localRecords) {
        const remote = remoteMap.get(local.id);
        if (!remote || local.updatedAt > remote.updated_at) {
          rowsToPush.push({
            id: local.id,
            vault_id: vaultId,
            nonce: local.nonce,
            ciphertext: local.ciphertext,
            created_at: local.createdAt,
            updated_at: local.updatedAt,
            is_deleted: false,
          });
        }
      }

      if (rowsToPush.length > 0) {
        const { error: pushError } = await client.from('ownnotes_records').upsert(rowsToPush);
        if (pushError) {
          console.error('Supabase bulk push error:', pushError);
        }
      }

      this.setStatus('synced');
      if (hasChanges && onRemoteChanges) {
        onRemoteChanges();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setStatus('error', msg);
    }
  }

  /**
   * Subscribe to real-time changes on Supabase.
   */
  public subscribeRealtime(onRemoteChange: () => void): () => void {
    const client = getSupabaseClient();
    const vaultId = vaultKeyManager.getVaultId();

    if (!client || !vaultId) return () => {};

    if (this.activeChannel) {
      client.removeChannel(this.activeChannel);
      this.activeChannel = null;
    }

    try {
      const channel = client
        .channel(`vault-${vaultId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'ownnotes_records',
            filter: `vault_id=eq.${vaultId}`,
          },
          () => {
            // Trigger sync sweep on incoming remote changes
            this.syncAll(onRemoteChange);
          }
        )
        .subscribe();

      this.activeChannel = channel;

      return () => {
        if (this.activeChannel) {
          client.removeChannel(this.activeChannel);
          this.activeChannel = null;
        }
      };
    } catch (err) {
      console.error('Failed to subscribe to Supabase Realtime:', err);
      return () => {};
    }
  }
}

export const supabaseSync = new SupabaseSyncService();
