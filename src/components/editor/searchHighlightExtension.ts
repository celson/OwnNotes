import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

import { findMatchesInDoc, type SearchMatch } from './searchUtils.js';

export { type SearchMatch };
export const searchHighlightPluginKey = new PluginKey<SearchPluginState>('searchHighlight');

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
      currentIndex: -1,
      results: [],
      decorations: DecorationSet.empty,
    };
  }

  const results = findMatchesInDoc(doc, cleanTerm);
  const decos: Decoration[] = [];

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
