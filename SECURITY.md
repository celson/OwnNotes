# Security Policy - OwnNotes

## Threat Model & Invariants

OwnNotes is built around one fundamental rule: **the user is the sole custodian of the cryptographic keys.**

### What OwnNotes Guarantees
1. **Zero Key Storage**: The mnemonic phrase and all derived keys exist only in volatile JavaScript execution memory (heap/RAM) while the vault is explicitly unlocked.
2. **Deterministic Derivation**: Given the same 12-word BIP-39 mnemonic, the exact same encryption key is derived across any platform, device, or OS.
3. **Sealed At Rest**: The local storage (IndexedDB) contains exclusively:
   - `id`: Opaque UUID v4.
   - `nonce`: 24 random bytes (base64 encoded).
   - `ciphertext`: Encrypted and authenticated payload (base64 encoded).
   - `updatedAt` / `createdAt`: Unix timestamps.
   - Note titles, bodies, tags, categories, and attributes are entirely inside the ciphertext.
4. **Secure In-Memory Clearing**: When locking, the key buffer is filled with zeroes (`activeKey.fill(0)`) to mitigate memory exposure.
5. **No Network Leakage**: In local-only mode, no network requests are dispatched. When remote sync adapters are enabled, only ciphertext and nonces ever leave the device.

### What OwnNotes Cannot Protect Against
- **Compromised Operating System / Keyloggers**: If malware or spyware runs on your device, it can monitor keystrokes while you type your 12-word phrase or capture the screen while decrypted notes are rendered.
- **Lost Phrase**: Because OwnNotes does not store your keys and has no backdoor, losing your 12-word phrase means permanent data loss. There is no password reset mechanism.
- **Physical Access while Unlocked**: If an attacker gains physical access to your device while the vault is active, they can view notes until the auto-lock timer engages.

## Reporting Security Issues

If you discover a vulnerability or cryptographic flaw in OwnNotes, please open an issue or contact the maintainers with technical details.
