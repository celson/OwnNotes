import { describe, it, expect } from 'vitest';

function findMatchesInText(text: string, query: string): { from: number; to: number }[] {
  const cleanTerm = (query || '').trim();
  if (!cleanTerm) return [];

  const lowerText = text.toLowerCase();
  const lowerQuery = cleanTerm.toLowerCase();
  const matches: { from: number; to: number }[] = [];

  let idx = lowerText.indexOf(lowerQuery);
  while (idx !== -1) {
    matches.push({
      from: idx,
      to: idx + cleanTerm.length,
    });
    idx = lowerText.indexOf(lowerQuery, idx + 1);
  }

  return matches;
}

describe('In-Text Search & Match Navigation', () => {
  const sampleNote = `Esta é uma nota de teste para verificar a busca no texto.
O teste deve grifar todas as palavras correspondentes.
Mais um teste final.`;

  it('finds all case-insensitive occurrences of query', () => {
    const matches = findMatchesInText(sampleNote, 'teste');
    expect(matches).toHaveLength(3);
    expect(sampleNote.substring(matches[0].from, matches[0].to).toLowerCase()).toBe('teste');
    expect(sampleNote.substring(matches[1].from, matches[1].to).toLowerCase()).toBe('teste');
    expect(sampleNote.substring(matches[2].from, matches[2].to).toLowerCase()).toBe('teste');
  });

  it('handles partial letter typing without error', () => {
    const matchesA = findMatchesInText(sampleNote, 't');
    expect(matchesA.length).toBeGreaterThan(3);

    const matchesTe = findMatchesInText(sampleNote, 'te');
    expect(matchesTe.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array for whitespace or empty query', () => {
    expect(findMatchesInText(sampleNote, '')).toEqual([]);
    expect(findMatchesInText(sampleNote, '   ')).toEqual([]);
  });

  it('correctly navigates next and previous indexes in circular order', () => {
    const totalMatches = 3;
    let currentIdx = 0;

    // Next
    currentIdx = (currentIdx + 1) % totalMatches;
    expect(currentIdx).toBe(1);

    currentIdx = (currentIdx + 1) % totalMatches;
    expect(currentIdx).toBe(2);

    currentIdx = (currentIdx + 1) % totalMatches;
    expect(currentIdx).toBe(0); // circular wrap

    // Prev
    currentIdx = (currentIdx - 1 + totalMatches) % totalMatches;
    expect(currentIdx).toBe(2);

    currentIdx = (currentIdx - 1 + totalMatches) % totalMatches;
    expect(currentIdx).toBe(1);
  });
});
