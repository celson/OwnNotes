import { describe, it, expect } from 'vitest';
import { encryptNote, decryptNote, generatePhrase, phraseToSeed, deriveAllKeys, wipe } from '../src/crypto/index.js';
import type { NoteItem } from '../src/crypto/types.js';

describe('Markdown Note Content Encryption & Integrity', () => {
  it('encrypts and decrypts complex markdown content without data loss', () => {
    const phrase = generatePhrase();
    const seed = phraseToSeed(phrase);
    const { vaultKey } = deriveAllKeys(seed);

    const complexMarkdown = `# Privacy & Security Guide

## Features Overview
- [x] Zero-knowledge client-side encryption
- [ ] Multi-device sync with Supabase
- [ ] Biometric quick-unlock

### Table of Algorithms
| Layer | Algorithm | Nonce / Key |
| :--- | :--- | :--- |
| Cipher | XChaCha20-Poly1305 | 24-byte random nonce |
| Derivation | HKDF-SHA256 | 32-byte domain separated |
| Entropy | BIP-39 (12 words) | 128-bit CSPRNG |

> "Your 12-word phrase is your identity and your key."

\`\`\`typescript
const cipher = xchacha20poly1305(key, nonce);
const ciphertext = cipher.encrypt(plaintext);
\`\`\`

---
*Note encrypted with 100% Zero-Knowledge.*
`;

    const originalNote: NoteItem = {
      id: 'md-note-test-1',
      title: 'Privacy & Security Guide',
      body: complexMarkdown,
      tags: ['markdown', 'guide', 'crypto'],
      category: 'Documentation',
      isFavorite: true,
      isPinned: true,
      isTrashed: false,
      createdAt: 1740000000000,
      updatedAt: 1740000005000,
    };

    const record = encryptNote(originalNote, vaultKey);

    // Verify metadata and markdown are hidden
    expect(record.id).toBe('md-note-test-1');
    expect(record.ciphertext).toBeTruthy();
    expect(record.nonce).toBeTruthy();
    expect(JSON.stringify(record)).not.toContain('Privacy & Security Guide');
    expect(JSON.stringify(record)).not.toContain('XChaCha20-Poly1305');
    expect(JSON.stringify(record)).not.toContain('- [x]');

    // Decrypt and verify exact preservation
    const decrypted = decryptNote(record, vaultKey);
    expect(decrypted.id).toBe(originalNote.id);
    expect(decrypted.title).toBe(originalNote.title);
    expect(decrypted.body).toBe(complexMarkdown);
    expect(decrypted.tags).toEqual(['markdown', 'guide', 'crypto']);
    expect(decrypted.isFavorite).toBe(true);
    expect(decrypted.isPinned).toBe(true);

    wipe(vaultKey);
    wipe(seed);
  });
});
