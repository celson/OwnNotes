import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

export const searchHighlightPluginKey = new PluginKey<SearchPluginState>('searchHighlight');

export interface SearchMatch {
  from: number;
  to: number;
}

export interface SearchPluginState {
  searchTerm: string;
  currentIndex: number;
  results: SearchMatch[];
  decorations: DecorationSet;
}

function computeSearchDecorations(doc: PMNode, searchTerm: string, currentIndex: number): SearchPluginState {
  const cleanTerm = (searchTerm || '').trim();
  if (!cleanTerm) {
    return {
      searchTerm: '',
      currentIndex: 0,
      results: [],
      decorations: DecorationSet.empty,
    };
  }

  const query = cleanTerm.toLowerCase();
  const results: SearchMatch[] = [];
  const decos: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase();
      let idx = text.indexOf(query);
      while (idx !== -1) {
        const from = pos + idx;
        const to = from + cleanTerm.length;
        results.push({ from, to });
        idx = text.indexOf(query, idx + 1);
      }
    }
  });

  results.forEach((res, i) => {
    const isCurrent = i === currentIndex;
    decos.push(
      Decoration.inline(res.from, res.to, {
        class: isCurrent ? 'search-result search-result-current' : 'search-result',
      })
    );
  });

  return {
    searchTerm: cleanTerm,
    currentIndex,
    results,
    decorations: DecorationSet.create(doc, decos),
  };
}

export const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: searchHighlightPluginKey,
        state: {
          init() {
            return {
              searchTerm: '',
              currentIndex: 0,
              results: [],
              decorations: DecorationSet.empty,
            };
          },
          apply(tr, prev, _oldState, newState) {
            const meta = tr.getMeta(searchHighlightPluginKey);
            let searchTerm = prev.searchTerm;
            let currentIndex = prev.currentIndex;

            if (meta) {
              if (meta.searchTerm !== undefined) searchTerm = meta.searchTerm;
              if (meta.currentIndex !== undefined) currentIndex = meta.currentIndex;
            }

            if (!searchTerm || !searchTerm.trim()) {
              return {
                searchTerm: '',
                currentIndex: 0,
                results: [],
                decorations: DecorationSet.empty,
              };
            }

            if (meta || tr.docChanged) {
              return computeSearchDecorations(newState.doc, searchTerm, currentIndex);
            }

            return prev;
          },
        },
        props: {
          decorations(state) {
            return searchHighlightPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
