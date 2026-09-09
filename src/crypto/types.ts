export interface DerivedKeys {
  vaultKey: Uint8Array;
  verifierKey: Uint8Array;
  backupKey: Uint8Array;
  vaultId: string; // Deterministic 32-byte hex ID for cloud sync routing
}

export interface EncryptedPayload {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
}

export interface EncryptedSerializedRecord {
  id: string;
  nonce: string; // Base64 (24 bytes)
  ciphertext: string; // Base64
  createdAt: number;
  updatedAt: number;
}

export interface SupabaseNoteRow {
  id: string;
  vault_id: string;
  nonce: string;
  ciphertext: string;
  created_at: number;
  updated_at: number;
  is_deleted: boolean;
}

export interface NoteItem {
  id: string;
  title: string;
  body: string;
  tags: string[];
  category?: string;
  isFavorite?: boolean;
  isPinned?: boolean;
  isTrashed?: boolean;
  createdAt: number;
  updatedAt: number;
}
