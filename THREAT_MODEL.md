# Threat Model - OwnNotes

This document specifies the trust boundaries, cryptographic algorithms, domain separation, and failure models of OwnNotes.

---

## 1. Cryptographic Primitives

| Component | Primitive | Library | Rationale |
|---|---|---|---|
| Mnemonic Generation | BIP-39 (128-bit entropy) | `@scure/bip39` | Standard, auditable, mnemonic format. |
| Mnemonic to Seed | PBKDF2 (HMAC-SHA512, 2048 iter) | `@scure/bip39` | Standard BIP-39 seed generation producing 64 bytes. |
| Key Derivation | HKDF-SHA256 (RFC 5869) | `@noble/hashes/hkdf` | Domain-separated extraction and expansion. |
| Symmetric Cipher | XChaCha20-Poly1305 (24-byte nonce) | `@noble/ciphers/chacha` | Fast, constant-time, immune to nonce reuse collisions under random nonces. |
| Memory Sanitization | `Uint8Array.prototype.fill(0)` | Native | Proactively overwrites sensitive byte buffers. |

---

## 2. Key Derivation & Domain Separation

From the 64-byte BIP-39 seed, HKDF-SHA256 generates distinct subkeys:

```
                  [ 12-Word Mnemonic ]
                           │
                 BIP-39 PBKDF2 (HMAC-SHA512)
                           │
                  [ 64-Byte Master Seed ]
                           │
               HKDF-SHA256 (Salt: undefined)
             ┌─────────────┼─────────────┐
             │             │             │
    Info: "ownnotes-   Info: "ownnotes-  Info: "ownnotes-
       vault-v1"         verifier-v1"       backup-v1"
             │             │             │
       [ 32-Byte ]    [ 32-Byte ]   [ 32-Byte ]
       Vault Key      Verifier Key   Backup Key
      (XChaCha20)     (Challenge)    (Exports)
```

No two functions share cryptographic key material. Exposing the verifier challenge hash reveals zero information about the vault key or the master seed.

---

## 3. Storage Model (At Rest)

IndexedDB table schema:

```typescript
interface EncryptedRecord {
  id: string;          // UUID v4 (plaintext identifier)
  nonce: string;       // 24-byte random nonce (Base64)
  ciphertext: string;  // XChaCha20-Poly1305 encrypted JSON payload (Base64)
  createdAt: number;   // Epoch timestamp (milliseconds)
  updatedAt: number;   // Epoch timestamp (milliseconds)
}
```

Plaintext Payload structure (prior to encryption):

```typescript
interface NotePayload {
  title: string;
  body: string;
  tags: string[];
  category?: string;
  isFavorite?: boolean;
  isPinned?: boolean;
  isTrashed?: boolean;
  attachments?: Array<{
    name: string;
    type: string;
    size: number;
    dataUrl: string;
  }>;
}
```

Notice:
- Plaintext payload contains all human-readable metadata.
- Outside the ciphertext, only random IDs, timestamps, and nonces are visible.

---

## 4. Key Lifecycle in Memory

1. **State: LOCKED**
   - No key exists in memory (`activeKey === null`).
   - UI shows lock / passphrase prompt screen.
   - Any attempt to read or write notes returns an error.

2. **State: UNLOCKING**
   - User inputs 12-word mnemonic.
   - Wordlist and checksum are verified.
   - Seed and subkeys are derived in volatile memory.
   - Verifier challenge is validated against stored verifier hash.
   - If verified, `activeKey` is set in memory.
   - Any temporary seed buffers are zeroed.

3. **State: ACTIVE / UNLOCKED**
   - Notes are decrypted on demand into React application state.
   - Any edits are immediately encrypted before calling storage adapters.
   - Auto-lock countdown tracks user activity (`mousemove`, `keydown`, `touchstart`).

4. **State: LOCKING**
   - User triggers lock or timeout expires or window closes.
   - `activeKey.fill(0)` is executed.
   - Decrypted notes are evicted from React state.
   - State returns to LOCKED.
