import type { Node as PMNode } from '@tiptap/pm/model';

export interface SearchMatch {
  from: number;
  to: number;
}

const DIACRITIC_MAP: Record<string, string> = {
  a: '[aàáâãäåā]',
  e: '[eèéêëē]',
  i: '[iìíîïī]',
  o: '[oòóôõöō]',
  u: '[uùúûüū]',
  c: '[cç]',
  n: '[nñ]',
};

/**
 * Builds a regular expression that matches text case-insensitively and
 * accent/diacritic-insensitively (e.g. 'nao' matches 'não', 'módulo' matches 'modulo').
 */
export function buildDiacriticRegex(query: string): RegExp {
  const normalized = (query || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  let pattern = '';
  for (const char of normalized) {
    const lower = char.toLowerCase();
    if (DIACRITIC_MAP[lower]) {
      pattern += DIACRITIC_MAP[lower];
    } else if (/[.*+?^${}()|[\]\\]/.test(char)) {
      pattern += '\\' + char;
    } else {
      pattern += char;
    }
  }

  return new RegExp(pattern, 'gi');
}

/**
 * Finds all case- and accent-insensitive occurrences of query in plain text.
 */
export function findMatchesInText(text: string, query: string): SearchMatch[] {
  const cleanTerm = (query || '').trim();
  if (!cleanTerm || !text) return [];

  let re: RegExp;
  try {
    re = buildDiacriticRegex(cleanTerm);
  } catch {
    return [];
  }

  const matches: SearchMatch[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      from: m.index,
      to: m.index + m[0].length,
    });
    if (m.index === re.lastIndex) re.lastIndex++;
  }

  return matches;
}

/**
 * Finds all case- and accent-insensitive occurrences of query in a ProseMirror doc.
 * Merges consecutive text nodes inside the same block run so matches can span
 * across marks (e.g. bold, italics, links, inline code).
 */
export function findMatchesInDoc(doc: PMNode, query: string): SearchMatch[] {
  const cleanTerm = (query || '').trim();
  if (!cleanTerm || !doc) return [];

  let re: RegExp;
  try {
    re = buildDiacriticRegex(cleanTerm);
  } catch {
    return [];
  }

  const runs: { text: string; pos: number }[] = [];
  let current: { text: string; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (node.isText) {
      if (current) {
        current.text += node.text ?? '';
      } else {
        current = { text: node.text ?? '', pos };
        runs.push(current);
      }
    } else {
      current = null;
    }
    return true;
  });

  const matches: SearchMatch[] = [];
  for (const run of runs) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(run.text)) !== null) {
      const from = run.pos + m.index;
      matches.push({ from, to: from + m[0].length });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  matches.sort((a, b) => a.from - b.from);
  return matches;
}
