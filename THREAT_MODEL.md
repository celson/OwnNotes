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
     ┌─────────────┬─────────────┬─────────────┬─────────────┐
     │             │             │             │             │
Info: "ownnotes-  "ownnotes-   "ownnotes-   "ownnotes-    "ownnotes-
   vault-v1"     verifier-v1"   backup-v1"  identity-v1"  sync-proof-v1"
     │             │             │             │             │
[ 32-Byte ]   [ 32-Byte ]   [ 32-Byte ]   [ 32-Byte ]   [ 32-Byte ]
 Vault Key    Verifier Key  Backup Key     Vault ID      Sync Proof
(XChaCha20)   (Challenge)    (Exports)   (Sync routing) (Claim secret)
```

No two functions share cryptographic key material. Exposing the verifier challenge hash reveals zero information about the vault key or the master seed. The same holds for the Vault ID (a public, non-secret routing pseudonym) and the Sync Proof (a secret that is never transmitted except once, to the `claim_vault` RPC — see Section 5).

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

---

## 5. Cloud Sync Access Control (Supabase)

The Vault ID (`INFO_IDENTITY`) is a public routing pseudonym: it identifies which rows belong to a vault, but knowledge of it grants **no** access on its own. Access to `public.ownnotes_records` is enforced entirely server-side by Postgres Row Level Security, gated behind two additional layers (`supabase/schema.sql`):

1. **Authentication.** Every client must hold an authenticated Supabase session (anonymous sign-in is sufficient — no email/password is collected). Unauthenticated (`anon`) requests are rejected by RLS for every operation on `ownnotes_records`.
2. **Ownership claim.** A session becomes an owner of a `vault_id` only by calling the `claim_vault(vault_id, proof)` RPC with the correct Sync Proof (`INFO_SYNC_PROOF`) — a subkey derived from the same 12-word phrase, but domain-separated from the vault key, verifier key, and vault ID. The first caller to present a given `vault_id`'s proof fixes it (stored only as a bcrypt hash in `vault_secrets`); every subsequent call, from any device, must match that hash or is rejected. Successful claims are recorded in `vault_owners`, which is exactly what the RLS policies on `ownnotes_records` check against.

This means an attacker who obtains the (necessarily public) Supabase anon key, or who observes/enumerates a `vault_id`, still cannot read, write, or delete that vault's rows without also knowing the 12-word phrase the Sync Proof is derived from. Realtime subscriptions are subject to the same RLS policies, so a session only ever receives change events for vault IDs it has claimed.

**What this does not protect against:** if an attacker already possesses the 12-word phrase, they possess everything (this is unchanged from Section 1 — the phrase is the sole root of trust). Claim-on-first-use also means that for a *brand new* `vault_id` that has never been claimed, whichever session presents the correct proof first wins the claim; this is not a practical race in normal use since the Sync Proof space is 256 bits and only derivable from the phrase.
