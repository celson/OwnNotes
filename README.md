# OwnNotes 🔐

> **Zero-knowledge encrypted notes for Web (PWA), Android and Desktop.**
> Your 12-word BIP-39 phrase is your identity and your key. There are no accounts, no passwords and no password reset.

Current version: **0.5.13**

---

## ✨ Features

### Security
- **Phrase-based vault**: a new vault generates a 12-word BIP-39 phrase (128 bits of entropy). The phrase can be copied or downloaded as a `.txt` file during onboarding. Unlocking accepts phrases from the English or Portuguese BIP-39 wordlists and tolerates list numbering, punctuation and extra whitespace when pasting.
- **Everything sealed at rest**: titles, bodies, tags and flags (pinned, favorite, trashed) are encrypted together into one ciphertext per note. Only the note ID, nonce and timestamps are stored outside it.
- **In-memory keys**: derived keys live only in JavaScript memory while the vault is unlocked and are zeroed (`fill(0)`) on lock.
- **Auto-lock**: locks after 1, 5, 15 (default), 30 or 60 minutes of inactivity, on manual lock, and when the page is closed or unloaded (`beforeunload` / `pagehide`).
- **Biometric unlock (Android only, opt-in)**: stores the phrase in the device's hardware-backed keystore, protected by a biometric prompt. Turning it off deletes the stored credential.

### Editor
- Rich-text Markdown editor built on [TipTap](https://tiptap.dev), with a toggle to edit the raw Markdown source.
- Toolbar: bold, italic, strikethrough, inline code, headings (H1–H3), bullet / numbered / task lists, blockquotes, syntax-highlighted code blocks, tables, horizontal rules, links, undo/redo.
- Find in note with `Ctrl+F` / `Cmd+F`.
- Links between notes: type `@` (Notion style) or `[[` (Obsidian style) to insert a link to another note.

### Organization
- Search across titles, bodies and tags. It runs on decrypted notes in memory and builds no persistent index.
- Tag filtering, pinned notes, favorites (starred), and a trash with restore and permanent delete.

### Backup & Sync
- **Encrypted backup**: export the vault as a JSON file. Notes stay encrypted inside it, and the file is signed with HMAC-SHA256 using a dedicated backup key so tampering is detected on import.
- **Optional cloud sync (Supabase)**: multi-device sync with Supabase Realtime. Only ciphertext, nonces, timestamps and a pseudonymous vault ID are sent. Access is enforced server-side by Row Level Security (see [Cloud Sync](#️-cloud-sync-optional)).
- **Update check**: checks GitHub Releases for newer versions. You can add a GitHub token in Settings to avoid API rate limits.

---

## 🖥️ Platforms

| Platform | Technology | Notes |
|---|---|---|
| Web / PWA | Vite + React 19 + `vite-plugin-pwa` | Installable as a Progressive Web App |
| Android | Capacitor 8 (`com.ownnotes.app`) | Signed APK built by CI |
| Desktop (Windows, macOS, Linux) | Tauri 2 | Installers built by CI; the Linux AppImage is patched for Wayland compatibility |

---

## 🧮 Cryptographic Architecture

All primitives come from the `@noble` and `@scure` libraries by Paul Miller.

```
            [ 12-word mnemonic ]
                     │
       BIP-39 PBKDF2 (HMAC-SHA512, 2048 iter)
                     │
            [ 64-byte seed ]
                     │
                HKDF-SHA256
   ┌──────────┬──────────┬──────────┬──────────┐
 vault-v1  verifier-v1 backup-v1 identity-v1 sync-proof-v1
   │          │          │          │          │
Vault key  Verifier   Backup key  Vault ID   Sync proof
(XChaCha20) (unlock    (backup     (sync      (claim_vault
            check)     HMAC)       routing)   secret)
```

| Subkey (HKDF info) | Purpose |
|---|---|
| `ownnotes-vault-v1` | 32-byte key for **XChaCha20-Poly1305** note encryption (random 24-byte nonces) |
| `ownnotes-verifier-v1` | HMAC-SHA256 challenge token saved locally so the app can check the phrase without saving any key |
| `ownnotes-backup-v1` | HMAC-SHA256 integrity signature of exported backup files |
| `ownnotes-identity-v1` | Public, pseudonymous vault ID used to route sync data |
| `ownnotes-sync-proof-v1` | Secret proof of ownership sent to the `claim_vault` RPC |

The seed is wiped right after derivation. For the full threat model, see [THREAT_MODEL.md](THREAT_MODEL.md) and [SECURITY.md](SECURITY.md).

### What is stored on the device

- **IndexedDB** (`OwnNotesVaultDB`): encrypted note records (`id`, `nonce`, `ciphertext`, `createdAt`, `updatedAt`) and the verifier token.
- **localStorage**: non-secret settings only: Supabase URL and anon key (when set in Settings), the optional GitHub token, and the biometric-enabled flag.
- **Android keystore**: the phrase, **only** if biometric unlock is turned on.

Encryption keys are never written to any of these.

### Limitations
- If you lose your phrase, your data is lost for good. There is no recovery mechanism.
- Malware or a keylogger on the device can capture the phrase as you type it, or read notes while they are shown on screen.
- Anyone with physical access to an unlocked device can read notes until auto-lock kicks in.

---

## ☁️ Cloud Sync (optional)

Sync uses a Supabase project that you provide:

1. Run [`supabase/schema.sql`](supabase/schema.sql) in your project's SQL editor. It creates the `ownnotes_records`, `vault_secrets` and `vault_owners` tables, the RLS policies, the `claim_vault` RPC, and the Realtime publication.
2. Turn on **Allow anonymous sign-ins** (Authentication → Sign In / Providers). Without it, every `claim_vault` call fails.
3. Set the project URL and anon key in either of these places:
   - in a `.env` file at build time (see [`.env.example`](.env.example)):
     ```env
     VITE_SUPABASE_URL=https://<project>.supabase.co
     VITE_SUPABASE_ANON_KEY=<anon key>
     ```
   - or at runtime in the app's **Settings** screen.

Each device signs in anonymously and calls `claim_vault(vault_id, proof)`. The first claim stores a bcrypt hash of the proof, and every later claim from any device must match it. RLS lets a session read or write only the vaults it has claimed, so the anon key and a vault ID alone give no access.

---

## 📦 Development

### Prerequisites
- **Node.js** (CI uses Node 22) and npm
- **Rust** stable, for desktop builds (on Linux, also the WebKitGTK dependencies from the [Tauri prerequisites](https://tauri.app/start/prerequisites/))
- **JDK 21** and the **Android SDK**, for Android builds

### Scripts

```bash
npm install            # Install dependencies

npm run dev            # Vite dev server on http://localhost:5173
npm run build          # Type-check (tsc) and build to dist/
npm run preview        # Preview the production build
npm run lint           # ESLint
npm test               # ESLint + Vitest test suite
npm run test:watch     # Vitest in watch mode

npm run desktop:dev    # Run the Tauri desktop app in dev mode
npm run desktop:build  # Build desktop installers

npm run cap:build      # Build web assets and sync to the Android project
npm run cap:open       # Open the Android project in Android Studio

npm run bump <x.y.z>   # Set the version in package.json, package-lock.json, tauri.conf.json, Cargo.toml, updateService.ts
```

### Tests

The Vitest suite in [`tests/`](tests) covers cryptography, backup export/import, the vault key manager (lock and auto-lock), Supabase sync, biometrics, the update checker, Markdown handling, note mentions, editor search and clipboard utilities, and React hook-order/lifecycle regressions.

### Project structure

```
src/
├── crypto/              # BIP-39, HKDF key derivation, XChaCha20-Poly1305
├── services/
│   ├── storage/         # IndexedDB adapter (Dexie)
│   ├── supabase/        # Sync client, config and service
│   ├── backup.ts        # Signed encrypted backup export/import
│   ├── biometricService.ts
│   ├── updateService.ts
│   └── vaultKeyManager.ts  # In-memory key lifecycle and auto-lock
└── components/          # React UI (editor, sidebar, modals)
supabase/schema.sql      # Database schema, RLS policies and claim_vault RPC
src-tauri/               # Tauri desktop shell
android/                 # Capacitor Android project
tests/                   # Vitest tests
```

### CI / Releases

GitHub Actions ([`.github/workflows`](.github/workflows)) runs on pushes and pull requests to `main` and on `v*` tags:
- **build-android.yml**: runs the tests, then builds a signed release APK. Pushes to `main` update the `latest` GitHub release, and `v*` tags create a versioned release.
- **build-desktop.yml**: builds Tauri bundles for Windows, macOS and Linux (Ubuntu 22.04).

---

## 📄 License

MIT. See [LICENSE](LICENSE).
