import { describe, it, expect } from 'vitest';
import { filterNoteItems } from '../src/components/editor/NoteMentionSuggestion.js';
import { encryptNote, decryptNote, generatePhrase, phraseToSeed, deriveAllKeys } from '../src/crypto/index.js';
import type { NoteItem } from '../src/crypto/types.js';

describe('Note Mention & Linking', () => {
  const sampleNotes: NoteItem[] = [
    {
      id: 'note-1',
      title: 'Project Roadmap 2026',
      body: 'Planning our milestones for Q3 and Q4.',
      tags: ['planning', 'work'],
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'note-2',
      title: 'Security Architecture',
      body: 'Zero-knowledge model with XChaCha20-Poly1305.',
      tags: ['crypto', 'security'],
      createdAt: 2000,
      updatedAt: 2000,
    },
    {
      id: 'note-3',
      title: 'Old Ideas (Trashed)',
      body: 'Discarded thoughts.',
      tags: ['archive'],
      isTrashed: true,
      createdAt: 3000,
      updatedAt: 3000,
    },
    {
      id: 'note-4',
      title: 'Daily Journal',
      body: 'Daily log and reflection.',
      tags: ['personal'],
      createdAt: 4000,
      updatedAt: 4000,
    },
  ];

  describe('filterNoteItems', () => {
    it('filters notes by title case-insensitively', () => {
      const results = filterNoteItems(sampleNotes, 'roadmap');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('note-1');
      expect(results[0].title).toBe('Project Roadmap 2026');
    });

    it('filters notes by tag', () => {
      const results = filterNoteItems(sampleNotes, 'crypto');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('note-2');
    });

    it('excludes trashed notes', () => {
      const results = filterNoteItems(sampleNotes, 'trashed');
      expect(results).toHaveLength(0);
    });

    it('excludes currently active note from its own mention list', () => {
      const results = filterNoteItems(sampleNotes, 'roadmap', 'note-1');
      expect(results).toHaveLength(0);
    });

    it('returns all active notes when query is empty', () => {
      const results = filterNoteItems(sampleNotes, '', 'note-1');
      expect(results).toHaveLength(2); // note-2 and note-4 (note-1 is current, note-3 is trashed)
      expect(results.map((r) => r.id)).toEqual(['note-2', 'note-4']);
    });
  });

  describe('Trigger Matching Rules', () => {
    function testAtMatch(input: string): boolean {
      const allowedPrefixes = [' ', '\n'];
      const regexp = /(?:^)?@[^\s]*/gm;
      const match = Array.from(input.matchAll(regexp)).pop();
      if (!match || match.index === undefined) return false;
      const matchPrefix = match.input.slice(Math.max(0, match.index - 1), match.index);
      return allowedPrefixes.includes(matchPrefix) || matchPrefix === '';
    }

    it('allows @ trigger at the start of a line', () => {
      expect(testAtMatch('@Roadmap')).toBe(true);
    });

    it('allows @ trigger after a space', () => {
      expect(testAtMatch('Check this out @Security')).toBe(true);
    });

    it('disallows @ trigger in email addresses', () => {
      expect(testAtMatch('user@example.com')).toBe(false);
    });

    it('matches [[ wiki-links correctly', () => {
      const wikiRegex = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
      const input = 'Referencing [[Project Roadmap 2026]] and [[Security Architecture|Sec Arch]]';
      const matches = Array.from(input.matchAll(wikiRegex));

      expect(matches).toHaveLength(2);
      expect(matches[0][1].trim()).toBe('Project Roadmap 2026');
      expect(matches[0][2]).toBeUndefined();

      expect(matches[1][1].trim()).toBe('Security Architecture');
      expect(matches[1][2]?.trim()).toBe('Sec Arch');
    });

    it('matches [Title](#note:id) markdown link convention correctly', () => {
      const noteLinkRegex = /\[([^\]]+)\]\(#note:([a-zA-Z0-9_-]+)\)/g;
      const input = 'See [Project Roadmap 2026](#note:note-1) for details.';
      const matches = Array.from(input.matchAll(noteLinkRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('Project Roadmap 2026');
      expect(matches[0][2]).toBe('note-1');
    });

    it('does not confuse image embeds with note mentions', () => {
      const noteLinkRegex = /(?<!\!)\[([^\]]+)\]\(#note:([a-zA-Z0-9_-]+)\)/g;
      const input = '![Image caption](#note:not-a-note) vs [Real Note](#note:note-1)';
      const matches = Array.from(input.matchAll(noteLinkRegex));

      expect(matches).toHaveLength(1);
      expect(matches[0][1]).toBe('Real Note');
      expect(matches[0][2]).toBe('note-1');
    });
  });

  describe('Zero-Knowledge Encryption Round-Trip with Note Mentions', () => {
    it('preserves note mentions and links intact across encryption and decryption', () => {
      const phrase = generatePhrase();
      const seed = phraseToSeed(phrase);
      const { vaultKey } = deriveAllKeys(seed);

      const bodyWithMentions = `# Sprint Review
Today we reviewed our progress against:
- [Project Roadmap 2026](#note:note-1)
- [[Security Architecture]]
- [[Daily Journal|Journal entry]]

All links remain private and encrypted inside the vault payload.`;

      const originalNote: NoteItem = {
        id: 'review-note',
        title: 'Sprint Review',
        body: bodyWithMentions,
        tags: ['review', 'sprint'],
        createdAt: 5000,
        updatedAt: 5000,
      };

      const encrypted = encryptNote(originalNote, vaultKey);

      // Verify that plain text mention titles and target IDs are not leaked in plaintext record
      expect(JSON.stringify(encrypted)).not.toContain('Project Roadmap 2026');
      expect(JSON.stringify(encrypted)).not.toContain('#note:note-1');
      expect(JSON.stringify(encrypted)).not.toContain('Security Architecture');

      // Decrypt and verify exact match
      const decrypted = decryptNote(encrypted, vaultKey);
      expect(decrypted.body).toBe(bodyWithMentions);
      expect(decrypted.body).toContain('[Project Roadmap 2026](#note:note-1)');
      expect(decrypted.body).toContain('[[Security Architecture]]');
      expect(decrypted.body).toContain('[[Daily Journal|Journal entry]]');
    });
  });
});
