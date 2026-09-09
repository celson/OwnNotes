# OwnNotes 🔐

> **Multiplatform Zero-Knowledge Encrypted Notes & Data Vault.**  
> Your 12-word phrase is your identity and your key. No accounts to compromise, no passwords stored, and zero key persistence.

---

## 🛡️ Core Security Invariant

**The encryption key is NEVER persisted anywhere:**
- ❌ Not in `localStorage`
- ❌ Not in `sessionStorage`
- ❌ Not in `IndexedDB`
- ❌ Not in cookies
- ❌ Not in application files or caches
- ❌ Not on any remote server

The encryption key is derived directly from your 12-word BIP-39 mnemonic into volatile memory (RAM) exclusively when you unlock the vault. On lock, tab close, or inactivity timeout, the in-memory key buffer is overwritten with zeros (`Uint8Array.fill(0)`) and discarded.

When closed or locked, what remains on your machine (in IndexedDB) is **only ciphertext and 24-byte random nonces**. Even note titles, tags, and folder names are sealed inside the ciphertext.

---

## 🧮 Cryptographic Architecture

OwnNotes relies on audited, modern cryptographic primitives from the `@noble` and `@scure` suites (by Paul Miller):

1. **BIP-39 Mnemonic**: 128 bits of cryptographically secure random entropy generates a 12-word mnemonic phrase.
2. **Seed Generation**: BIP-39 PBKDF2 (HMAC-SHA512, 2048 iterations) derives a 64-byte seed.
3. **HKDF-SHA256 Derivation**: Independent cryptographic branches are generated using domain-separated context info strings:
   - `ownnotes-vault-v1`: 32-byte symmetric key for XChaCha20-Poly1305.
   - `ownnotes-verifier-v1`: Key used solely to compute/verify a challenge hash so the app can verify your phrase without storing the vault key.
   - `ownnotes-backup-v1`: Key used for encrypted JSON file export/import.
4. **Cipher**: **XChaCha20-Poly1305** authenticated encryption with random 24-byte nonces. Unlike AES-GCM (12-byte nonces), 24-byte nonces eliminate collision risk with random generation.

---

## 🚀 Features

- **End-to-End Zero-Knowledge**: Zero plaintext at rest.
- **In-Memory Volatile Session**: Keys live in RAM only and are wiped upon auto-lock or manual lock.
- **Auto-Lock Timer**: Automatically locks after a configurable period of inactivity (e.g. 5m, 15m, 30m) or when backgrounded.
- **Pluggable Storage Engine**: Built-in IndexedDB adapter with abstract interface for future cloud/sync adapters (WebDAV, CouchDB, S3, REST).
- **Markdown & Rich Content**: Real-time markdown preview, tag filtering, search (in-memory index only), favorites, and trash.
- **Encrypted Export & Backup**: Export your entire vault as an encrypted JSON archive.
- **Multiplatform & PWA**: Responsive UI designed for Mobile, Tablet, and Desktop, installable as a Progressive Web App and ready for Tauri packaging.

---

## 📦 Getting Started

### Prerequisites
- Node.js >= 20
- npm / pnpm

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run automated cryptographic tests
npm test

# Build production bundle
npm run build
```

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
