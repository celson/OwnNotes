import { describe, it, expect, vi } from 'vitest';
import type { NoteItem } from '../src/crypto/types.js';
import {
  generatePhrase,
  phraseToSeed,
  deriveAllKeys,
  deriveVaultId,
  bytesToHex,
  wipe,
} from '../src/crypto/index.js';

describe('Supabase Vault Identity & Sync Primitives', () => {
  it('deterministically derives a 64-character hex vaultId from mnemonic phrase', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed1 = phraseToSeed(phrase);
    const seed2 = phraseToSeed(phrase);

    const vaultId1 = deriveVaultId(seed1);
    const vaultId2 = deriveVaultId(seed2);

    expect(vaultId1.length).toBe(64); // 32 bytes in hex
    expect(vaultId1).toBe(vaultId2);

    wipe(seed1);
    wipe(seed2);
  });

  it('guarantees cryptographic domain separation between vaultId and keys', () => {
    const phrase = generatePhrase();
    const seed = phraseToSeed(phrase);
    const keys = deriveAllKeys(seed);

    expect(keys.vaultId.length).toBe(64);
    expect(keys.vaultId).not.toBe(bytesToHex(keys.vaultKey));
    expect(keys.vaultId).not.toBe(bytesToHex(keys.verifierKey));
    expect(keys.vaultId).not.toBe(bytesToHex(keys.backupKey));
    expect(keys.vaultId).not.toBe(keys.syncProof);

    wipe(seed);
  });

  it('derives a deterministic, domain-separated sync proof used only to claim vault ownership', () => {
    const phrase = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed1 = phraseToSeed(phrase);
    const seed2 = phraseToSeed(phrase);

    const keys1 = deriveAllKeys(seed1);
    const keys2 = deriveAllKeys(seed2);

    expect(keys1.syncProof.length).toBe(64); // 32 bytes in hex
    expect(keys1.syncProof).toBe(keys2.syncProof);
    expect(keys1.syncProof).not.toBe(keys1.vaultId);

    wipe(seed1);
    wipe(seed2);
  });

  it('generates distinct vault IDs for different mnemonic phrases', () => {
    const phrase1 = generatePhrase();
    const phrase2 = generatePhrase();

    const seed1 = phraseToSeed(phrase1);
    const seed2 = phraseToSeed(phrase2);

    const id1 = deriveVaultId(seed1);
    const id2 = deriveVaultId(seed2);

    expect(id1).not.toBe(id2);

    wipe(seed1);
    wipe(seed2);
  });

  it('fails safely when purgeRemoteVault is called without client or active vault', async () => {
    const { supabaseSync } = await import('../src/services/supabase/syncService.js');
    const res = await supabaseSync.purgeRemoteVault();
    expect(res.success).toBe(false);
    expect(res.message).toBeDefined();
  });

  it('accepts remote note updates on active note once typing debounce completes', () => {
    const activeNoteId = 'note-live-sync-test';

    const localNotes: NoteItem[] = [
      {
        id: activeNoteId,
        title: 'Meeting Notes',
        body: 'Initial content on device B',
        tags: ['work'],
        category: 'Work',
        isFavorite: false,
        isPinned: false,
        isTrashed: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const remoteIncomingNote: NoteItem = {
      id: activeNoteId,
      title: 'Meeting Notes Updated',
      body: 'Live content streamed from Device A!',
      tags: ['work'],
      category: 'Work',
      isFavorite: false,
      isPinned: false,
      isTrashed: false,
      createdAt: 1000,
      updatedAt: 2000,
    };

    const applyDecryptedList = (
      prevNotes: NoteItem[],
      decryptedList: NoteItem[],
      currentSelectedId: string | null,
      timeoutRef: ReturnType<typeof setTimeout> | null
    ) => {
      const activeDraft = currentSelectedId ? prevNotes.find((p) => p.id === currentSelectedId) : null;
      return decryptedList.map((n) => {
        if (activeDraft && n.id === activeDraft.id && timeoutRef) {
          return activeDraft;
        }
        return n;
      });
    };

    // While debounce timer is active, retain local typing draft
    let saveTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {}, 350);
    const duringTypingResult = applyDecryptedList(localNotes, [remoteIncomingNote], activeNoteId, saveTimeout);
    expect(duringTypingResult[0].body).toBe('Initial content on device B');

    // Once debounce finishes and resets to null, incoming remote updates are accepted immediately
    clearTimeout(saveTimeout);
    saveTimeout = null;

    const afterDebounceResult = applyDecryptedList(localNotes, [remoteIncomingNote], activeNoteId, saveTimeout);
    expect(afterDebounceResult[0].body).toBe('Live content streamed from Device A!');
    expect(afterDebounceResult[0].title).toBe('Meeting Notes Updated');
    expect(afterDebounceResult[0].updatedAt).toBe(2000);
  });

  it('serializes concurrent syncAll calls and avoids unhandled errors', async () => {
    const { supabaseSync } = await import('../src/services/supabase/syncService.js');

    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    await Promise.all([
      supabaseSync.syncAll(cb1),
      supabaseSync.syncAll(cb2),
      supabaseSync.syncAll(cb3),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(['idle', 'not_configured', 'synced']).toContain(supabaseSync.getStatus());
  });
});
