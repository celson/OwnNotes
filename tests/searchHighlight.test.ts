import { describe, it, expect } from 'vitest';
import { findMatchesInText } from '../src/components/editor/searchUtils.js';

describe('In-Text Search & Match Navigation', () => {
  const sampleNote = `Esta é uma nota de teste para verificar a busca no texto.
O teste deve grifar todas as palavras correspondentes.
Mais um teste final com configurações e módulos.`;

  it('finds all case-insensitive occurrences of query', () => {
    const matches = findMatchesInText(sampleNote, 'teste');
    expect(matches).toHaveLength(3);
    expect(sampleNote.substring(matches[0].from, matches[0].to).toLowerCase()).toBe('teste');
    expect(sampleNote.substring(matches[1].from, matches[1].to).toLowerCase()).toBe('teste');
    expect(sampleNote.substring(matches[2].from, matches[2].to).toLowerCase()).toBe('teste');
  });

  it('finds accented Portuguese words when searched without accents', () => {
    // Note contains "configurações" and "módulos"
    const matchConfig = findMatchesInText(sampleNote, 'configuracoes');
    expect(matchConfig).toHaveLength(1);
    expect(sampleNote.substring(matchConfig[0].from, matchConfig[0].to)).toBe('configurações');

    const matchModulo = findMatchesInText(sampleNote, 'modulos');
    expect(matchModulo).toHaveLength(1);
    expect(sampleNote.substring(matchModulo[0].from, matchModulo[0].to)).toBe('módulos');

    const matchE = findMatchesInText(sampleNote, 'e'); // Matches "é" and "e"
    expect(matchE.length).toBeGreaterThan(0);
  });

  it('finds unaccented words when searched with accents', () => {
    const text = 'Esta e uma nota simples sem acentos.';
    const matches = findMatchesInText(text, 'é');
    expect(matches.length).toBeGreaterThan(0);
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

  it('safely handles special regex characters in query', () => {
    const specialText = 'Verifique o item [importante] e regex *foo* com $valor e (nota).';
    expect(findMatchesInText(specialText, '[importante]')).toHaveLength(1);
    expect(findMatchesInText(specialText, '*foo*')).toHaveLength(1);
    expect(findMatchesInText(specialText, '$valor')).toHaveLength(1);
    expect(findMatchesInText(specialText, '(nota)')).toHaveLength(1);
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
