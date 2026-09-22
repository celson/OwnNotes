import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ReactRenderer } from '@tiptap/react';
import type {
  SuggestionOptions,
  SuggestionProps,
  SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { FileText, Tag as TagIcon } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import type { NoteItem } from '../../crypto/types.js';

export interface MentionItem {
  id: string;
  title: string;
  tags?: string[];
  snippet?: string;
}

export interface NoteMentionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export interface NoteMentionListProps {
  items: MentionItem[];
  query: string;
  command: (item: { id: string; title: string }) => void;
}

export const NoteMentionList = forwardRef<NoteMentionListRef, NoteMentionListProps>(
  ({ items, query, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement | null>(null);

    // Reset selection when items change
    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    // Ensure selected item is scrolled into view
    useEffect(() => {
      const el = listRef.current?.querySelector('[data-selected="true"]');
      el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
          return true;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          if (items.length > 0 && items[selectedIndex]) {
            event.preventDefault();
            const item = items[selectedIndex];
            command({ id: item.id, title: item.title });
            return true;
          }
        }
        if (event.key === 'Escape') {
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="z-50 w-72 rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md select-none">
          <div className="text-center text-xs text-slate-500 py-1">
            {query.trim() ? `No notes matching "${query.trim()}"` : 'No notes available'}
          </div>
        </div>
      );
    }

    return (
      <div
        ref={listRef}
        className="z-50 w-80 max-h-64 overflow-y-auto rounded-xl border border-slate-700/80 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md space-y-0.5 select-none scrollbar-thin scrollbar-thumb-slate-700"
      >
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center justify-between">
          <span>Reference Note</span>
          <span className="text-[9px] font-normal lowercase text-slate-600">↵ to select</span>
        </div>

        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              data-selected={isSelected}
              onClick={() => command({ id: item.id, title: item.title })}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition-all cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600/25 text-indigo-100 border border-indigo-500/40 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/70 border border-transparent'
              }`}
            >
              <FileText
                className={`w-3.5 h-3.5 shrink-0 ${
                  isSelected ? 'text-indigo-400' : 'text-slate-400'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-slate-200">
                  {highlightMatch(item.title, query)}
                </div>
                {item.snippet && (
                  <div className="text-[10px] text-slate-500 truncate leading-tight">
                    {item.snippet}
                  </div>
                )}
              </div>
              {item.tags && item.tags.length > 0 && (
                <span className="text-[10px] text-slate-500 flex items-center gap-0.5 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50 shrink-0">
                  <TagIcon className="w-2.5 h-2.5 text-slate-400" />
                  <span className="max-w-16 truncate">{item.tags[0]}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }
);

NoteMentionList.displayName = 'NoteMentionList';

/** Highlight matching query characters in the title */
function highlightMatch(title: string, query: string): React.ReactNode {
  if (!query.trim()) return title;
  const q = query.trim().toLowerCase();
  const idx = title.toLowerCase().indexOf(q);
  if (idx < 0) return title;

  return (
    <>
      {title.slice(0, idx)}
      <span className="text-indigo-400 font-semibold underline decoration-indigo-400/50">
        {title.slice(idx, idx + q.length)}
      </span>
      {title.slice(idx + q.length)}
    </>
  );
}

/** Update the floating popup position from TipTap's clientRect */
function updatePopupPosition(
  popup: HTMLDivElement,
  clientRect?: (() => DOMRect | null) | null
) {
  if (!clientRect) return;
  const rect = clientRect();
  if (!rect) return;

  const top = rect.bottom + window.scrollY + 6;
  const left = rect.left + window.scrollX;

  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  // Prevent popup from extending off-screen to the right
  requestAnimationFrame(() => {
    const popupRect = popup.getBoundingClientRect();
    if (popupRect.right > window.innerWidth - 12) {
      const adjustedLeft = Math.max(12, window.innerWidth - popupRect.width - 12);
      popup.style.left = `${adjustedLeft}px`;
    }
    // Prevent extending below viewport if near bottom
    if (popupRect.bottom > window.innerHeight - 12) {
      const adjustedTop = Math.max(12, rect.top + window.scrollY - popupRect.height - 6);
      popup.style.top = `${adjustedTop}px`;
    }
  });
}

export function filterNoteItems(
  notes: NoteItem[],
  query: string,
  currentNoteId?: string
): MentionItem[] {
  const q = query.trim().toLowerCase();
  return notes
    .filter((n) => !n.isTrashed && n.id !== currentNoteId)
    .filter((n) => {
      if (!q) return true;
      const titleMatch = (n.title || '').toLowerCase().includes(q);
      const tagMatch = n.tags?.some((t) => t.toLowerCase().includes(q));
      return titleMatch || tagMatch;
    })
    .slice(0, 15)
    .map((n) => ({
      id: n.id,
      title: n.title.trim() || 'Untitled Note',
      tags: n.tags,
      snippet: n.body ? n.body.slice(0, 60).replace(/\n/g, ' ') : undefined,
    }));
}

/** Create Suggestion options for TipTap suggestion plugin */
export function buildNoteSuggestionOptions(
  editor: Editor,
  triggerChar: '@' | '[[',
  pluginKey: PluginKey,
  getNotes: () => NoteItem[],
  getCurrentNoteId: () => string | undefined,
  insertMentionCommand: (editor: Editor, range: { from: number; to: number }, item: { id: string; title: string }) => void
): SuggestionOptions<MentionItem, { id: string; title: string }> {
  return {
    editor,
    pluginKey,
    char: triggerChar,
    allowSpaces: true,
    allowedPrefixes: triggerChar === '@' ? [' ', '\n'] : null,

    items: ({ query }) => {
      const notes = getNotes();
      return filterNoteItems(notes, query, getCurrentNoteId());
    },

    command: ({ editor, range, props }) => {
      insertMentionCommand(editor, range, props);
    },

    render: () => {
      let component: ReactRenderer<NoteMentionListRef> | null = null;
      let popup: HTMLDivElement | null = null;
      let blurHandler: (() => void) | null = null;

      return {
        onStart(props: SuggestionProps<MentionItem, { id: string; title: string }>) {
          component = new ReactRenderer(NoteMentionList, {
            props: {
              items: props.items,
              query: props.query,
              command: props.command,
            },
            editor: props.editor,
          });

          popup = document.createElement('div');
          popup.style.position = 'absolute';
          popup.style.zIndex = '9999';
          // Prevent mousedown from blurring the editor
          popup.addEventListener('mousedown', (e) => e.preventDefault());
          popup.appendChild(component.element);
          document.body.appendChild(popup);

          updatePopupPosition(popup, props.clientRect);

          const editorDom = props.editor.view.dom;
          blurHandler = () => cleanup();
          editorDom.addEventListener('focusout', blurHandler);
        },

        onUpdate(props: SuggestionProps<MentionItem, { id: string; title: string }>) {
          if (!component) return;
          component.updateProps({
            items: props.items,
            query: props.query,
            command: props.command,
          });
          if (popup) updatePopupPosition(popup, props.clientRect);
        },

        onKeyDown(props: SuggestionKeyDownProps) {
          if (props.event.key === 'Escape') {
            cleanup();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit() {
          cleanup();
        },
      };

      function cleanup() {
        if (blurHandler) {
          window.removeEventListener('focusout', blurHandler);
          blurHandler = null;
        }
        component?.destroy();
        component = null;
        if (popup) {
          popup.remove();
          popup = null;
        }
      }
    },
  };
}
