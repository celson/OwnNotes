import React from 'react';
import {
  Node,
  mergeAttributes,
  InputRule,
  type Editor,
} from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { FileText } from 'lucide-react';
import type { NoteItem } from '../../crypto/types.js';
import { buildNoteSuggestionOptions } from './NoteMentionSuggestion.js';

export interface NoteMentionOptions {
  onSelectNote?: (noteId: string) => void;
  getNotes?: () => NoteItem[];
  getCurrentNoteId?: () => string | undefined;
}

/** React NodeView for the inline NoteMention chip */
const NoteMentionView: React.FC<NodeViewProps> = ({ node, extension }) => {
  const { id, title } = node.attrs as { id: string; title: string };
  const options = extension.options as NoteMentionOptions;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let targetId = id;
    if (!targetId && options.getNotes) {
      const notes = options.getNotes();
      const match = notes.find(
        (n) => n.title.trim().toLowerCase() === (title || '').trim().toLowerCase()
      );
      if (match) {
        targetId = match.id;
      }
    }

    if (targetId && options.onSelectNote) {
      options.onSelectNote(targetId);
    }
  };

  const displayTitle = title?.trim() || 'Untitled Note';

  return (
    <NodeViewWrapper as="span" className="inline-block align-baseline">
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleClick(e as unknown as React.MouseEvent);
          }
        }}
        title={`Open note "${displayTitle}"`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 hover:text-indigo-200 border border-indigo-500/30 font-medium text-[12px] cursor-pointer align-baseline select-none transition-all group active:scale-95"
      >
        <FileText className="w-3 h-3 text-indigo-400 group-hover:text-indigo-300 shrink-0" />
        <span className="truncate max-w-56">{displayTitle}</span>
      </span>
    </NodeViewWrapper>
  );
};

/** Markdown-it inline parser rule for [[wiki-links]] and [Title](#note:id) */
function noteMentionMarkdownRule(state: any): boolean {
  const { src, pos, posMax } = state;

  // 1. Check for [[Target]] or [[Target|Label]]
  if (src.charCodeAt(pos) === 0x5b && src.charCodeAt(pos + 1) === 0x5b) {
    if (pos > 0 && src.charCodeAt(pos - 1) === 0x21) {
      // Guard against image embed ![[image.png]]
      return false;
    }

    const closeIdx = src.indexOf(']]', pos + 2);
    if (closeIdx < 0 || closeIdx > posMax) return false;

    const inner = src.slice(pos + 2, closeIdx).trim();
    if (!inner) return false;

    const pipeIdx = inner.indexOf('|');
    const target = pipeIdx >= 0 ? inner.slice(0, pipeIdx).trim() : inner;
    const label = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : null;
    const displayTitle = label || target;

    const token = state.push('html_inline', '', 0);
    const esc = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    token.content = `<span data-note-mention data-note-id="" data-note-title="${esc(displayTitle)}">📄 ${esc(displayTitle)}</span>`;

    state.pos = closeIdx + 2;
    return true;
  }

  // 2. Check for [Title](#note:id)
  if (src.charCodeAt(pos) === 0x5b) {
    if (pos > 0 && src.charCodeAt(pos - 1) === 0x21) {
      // Guard against image ![alt](#note:id)
      return false;
    }

    const closeBracket = src.indexOf(']', pos + 1);
    if (closeBracket < 0 || closeBracket > posMax) return false;

    if (src.slice(closeBracket + 1, closeBracket + 8) === '(#note:') {
      const closeParen = src.indexOf(')', closeBracket + 8);
      if (closeParen < 0 || closeParen > posMax) return false;

      const title = src.slice(pos + 1, closeBracket).trim() || 'Untitled Note';
      const noteId = src.slice(closeBracket + 8, closeParen).trim();

      const token = state.push('html_inline', '', 0);
      const esc = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      token.content = `<span data-note-mention data-note-id="${esc(noteId)}" data-note-title="${esc(title)}">📄 ${esc(title)}</span>`;

      state.pos = closeParen + 1;
      return true;
    }
  }

  return false;
}

export const NoteMention = Node.create<NoteMentionOptions>({
  name: 'noteMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      onSelectNote: undefined,
      getNotes: () => [],
      getCurrentNoteId: () => undefined,
    };
  },

  addAttributes() {
    return {
      id: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-note-id') || '',
        renderHTML: (attributes) => ({
          'data-note-id': attributes.id,
        }),
      },
      title: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-note-title') ||
          element.textContent?.replace(/^📄\s*/, '') ||
          '',
        renderHTML: (attributes) => ({
          'data-note-title': attributes.title,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-note-mention]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            id: el.getAttribute('data-note-id') || '',
            title:
              el.getAttribute('data-note-title') ||
              el.textContent?.replace(/^📄\s*/, '') ||
              '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const title = HTMLAttributes.title || 'Untitled Note';
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-note-mention': '',
        class:
          'note-mention-badge inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md bg-indigo-500/15 text-indigo-300 font-medium text-[12px] border border-indigo-500/30 cursor-pointer align-baseline select-none transition-colors hover:bg-indigo-500/25',
      }),
      `📄 ${title}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteMentionView);
  },

  addInputRules() {
    const type = this.type;
    return [
      // Matches [[Note Title]]
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const raw = match[1]?.trim() ?? '';
          if (!raw) return;
          const pipeIdx = raw.indexOf('|');
          const title = pipeIdx >= 0 ? raw.slice(pipeIdx + 1).trim() : raw;
          const target = pipeIdx >= 0 ? raw.slice(0, pipeIdx).trim() : raw;

          // Attempt lookup in notes if available
          const notes = this.options.getNotes?.() || [];
          const matchedNote = notes.find(
            (n) => n.title.trim().toLowerCase() === target.toLowerCase()
          );

          const node = type.create({
            id: matchedNote?.id || '',
            title: title || target,
          });

          state.tr.replaceWith(range.from, range.to, [
            node,
            state.schema.text(' '),
          ]);
        },
      }),

      // Matches [Title](#note:id)
      new InputRule({
        find: /\[([^\]]+)\]\(#note:([a-zA-Z0-9_-]+)\)$/,
        handler: ({ state, range, match }) => {
          const title = match[1]?.trim() || 'Untitled Note';
          const id = match[2]?.trim() || '';

          const node = type.create({ id, title });
          state.tr.replaceWith(range.from, range.to, [
            node,
            state.schema.text(' '),
          ]);
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const insertCommand = (
      editor: Editor,
      range: { from: number; to: number },
      item: { id: string; title: string }
    ) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent([
          {
            type: this.name,
            attrs: { id: item.id, title: item.title },
          },
          {
            type: 'text',
            text: ' ',
          },
        ])
        .run();
    };

    return [
      // Trigger 1: @ (Notion style)
      Suggestion(
        buildNoteSuggestionOptions(
          this.editor,
          '@',
          new PluginKey('noteMentionAt'),
          () => this.options.getNotes?.() || [],
          () => this.options.getCurrentNoteId?.(),
          insertCommand
        )
      ),

      // Trigger 2: [[ (Obsidian style)
      Suggestion(
        buildNoteSuggestionOptions(
          this.editor,
          '[[',
          new PluginKey('noteMentionWiki'),
          () => this.options.getNotes?.() || [],
          () => this.options.getCurrentNoteId?.(),
          insertCommand
        )
      ),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const id = node.attrs.id;
          const title = node.attrs.title || 'Untitled Note';
          if (id) {
            state.write(`[${title}](#note:${id})`);
          } else {
            state.write(`[[${title}]]`);
          }
        },
        parse: {
          setup(markdownit: any) {
            markdownit.inline.ruler.push('note_mention', noteMentionMarkdownRule);
          },
        },
      },
    };
  },
});
