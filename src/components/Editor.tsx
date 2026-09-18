import React, { useState } from 'react';
import type { Editor as TipTapEditorInstance } from '@tiptap/core';
import {
  Star,
  Pin,
  Trash2,
  RotateCcw,
  Tag,
  Menu,
  CheckCircle2,
  Shield,
  Plus,
  CloudCheck,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import type { NoteItem } from '../crypto/types.js';
import type { SyncStatus } from '../services/supabase/syncService.js';
import { EditorToolbar } from './editor/EditorToolbar.js';
import { EditorSearchBar } from './editor/EditorSearchBar.js';
import { RichMarkdownEditor } from './editor/RichMarkdownEditor.js';
import { RawMarkdownEditor } from './editor/RawMarkdownEditor.js';
import { searchHighlightPluginKey } from './editor/searchHighlightExtension.js';
import { findMatchesInDoc, findMatchesInText } from './editor/searchUtils.js';
import { APP_VERSION } from '../services/updateService.js';

function stripMarkdown(md: string): string {
  if (!md) return '';
  return md
    // remove code fences: ```lang and ```
    .replace(/^```[a-zA-Z0-9_-]*\s*$/gm, '')
    // remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // remove table separators |---|---|
    .replace(/^[|\s:-]+$/gm, '')
    // replace table pipes with space
    .replace(/\|/g, ' ')
    // remove header markers
    .replace(/^#{1,6}\s+/gm, '')
    // remove blockquote markers
    .replace(/^>\s*/gm, '')
    // remove list markers and task checkboxes (- [ ], * [x], 1.)
    .replace(/^\s*([-*+]|\d+\.)(\s+\[[ xX]\])?\s+/gm, '')
    // replace links and images [text](url) -> text
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    // remove bold/italic/strikethrough markers
    .replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, '$2')
    // remove inline code `code` -> code
    .replace(/`([^`]+)`/g, '$1')
    // remove html tags
    .replace(/<[^>]+>/g, '');
}

export interface MatchEntry {
  target: 'title' | 'body';
  from: number;
  to: number;
}

interface EditorProps {
  note: NoteItem | null;
  onUpdateNote: (updated: Partial<NoteItem>) => void;
  onDeleteNote: (id: string, permanent?: boolean) => void;
  onNewNote?: () => void;
  onToggleMobileSidebar: () => void;
  isSaving: boolean;
  syncStatus?: SyncStatus;
  isCloudConfigured?: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  note,
  onUpdateNote,
  onDeleteNote,
  onNewNote,
  onToggleMobileSidebar,
  isSaving,
  syncStatus = 'idle',
  isCloudConfigured = false,
}) => {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [activeTipTapEditor, setActiveTipTapEditor] = useState<TipTapEditorInstance | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  // Global Ctrl+F / Cmd+F handler to open/focus in-text search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [hasNavigated, setHasNavigated] = useState(false);

  const jumpToMatch = (index: number, matchArray: MatchEntry[]) => {
    if (matchArray.length === 0 || !matchArray[index]) return;
    const match = matchArray[index];

    if (match.target === 'title') {
      if (titleInputRef.current) {
        titleInputRef.current.focus();
        titleInputRef.current.setSelectionRange(match.from, match.to);
      }
      if (activeTipTapEditor && !isSourceMode && !activeTipTapEditor.isDestroyed) {
        activeTipTapEditor.view.dispatch(
          activeTipTapEditor.state.tr.setMeta(searchHighlightPluginKey, {
            currentIndex: -1,
          })
        );
      }
    } else {
      // Body match
      const titleCount = matchArray.filter((m) => m.target === 'title').length;
      const bodyIndex = index - titleCount;

      if (activeTipTapEditor && !isSourceMode && !activeTipTapEditor.isDestroyed) {
        try {
          // Update active match index in decorations
          activeTipTapEditor.view.dispatch(
            activeTipTapEditor.state.tr.setMeta(searchHighlightPluginKey, {
              currentIndex: bodyIndex,
            })
          );

          // Center scroll into view
          const hit = activeTipTapEditor.view.dom.querySelector('.search-result-current') as HTMLElement | null;
          if (hit) {
            hit.scrollIntoView({ block: 'center', inline: 'nearest' });
          } else {
            activeTipTapEditor
              .chain()
              .setTextSelection({ from: match.from, to: match.to })
              .scrollIntoView()
              .run();
          }
        } catch {
          // Safe fallback
        }
      } else {
        const textarea = document.querySelector('textarea');
        if (textarea) {
          textarea.focus();
          textarea.setSelectionRange(match.from, match.to);
          const fullText = textarea.value;
          const textUpToMatch = fullText.substring(0, match.from);
          const lineBreaks = textUpToMatch.split('\n').length;
          textarea.scrollTop = Math.max(0, (lineBreaks - 3) * 20);
        }
      }
    }
  };

  // Recompute matches and update search highlight decorations without stealing focus
  React.useEffect(() => {
    const cleanTerm = searchQuery.trim();
    if (!isSearchOpen || !cleanTerm || !note) {
      setMatches([]);
      setCurrentMatchIndex(0);
      setHasNavigated(false);
      if (activeTipTapEditor && !activeTipTapEditor.isDestroyed) {
        activeTipTapEditor.view.dispatch(
          activeTipTapEditor.state.tr.setMeta(searchHighlightPluginKey, {
            searchTerm: '',
            currentIndex: -1,
          })
        );
      }
      return;
    }

    // 1. Matches in note title
    const titleMatches: MatchEntry[] = findMatchesInText(note.title || '', cleanTerm).map((m) => ({
      target: 'title',
      from: m.from,
      to: m.to,
    }));

    // 2. Matches in note body
    let bodyMatches: MatchEntry[] = [];
    if (activeTipTapEditor && !isSourceMode && !activeTipTapEditor.isDestroyed) {
      bodyMatches = findMatchesInDoc(activeTipTapEditor.state.doc, cleanTerm).map((m) => ({
        target: 'body',
        from: m.from,
        to: m.to,
      }));

      // Highlight all matching occurrences in real time
      activeTipTapEditor.view.dispatch(
        activeTipTapEditor.state.tr.setMeta(searchHighlightPluginKey, {
          searchTerm: cleanTerm,
          currentIndex: -1,
        })
      );
    } else {
      bodyMatches = findMatchesInText(note.body || '', cleanTerm).map((m) => ({
        target: 'body',
        from: m.from,
        to: m.to,
      }));
    }

    const allMatches = [...titleMatches, ...bodyMatches];
    setMatches(allMatches);
    setCurrentMatchIndex(0);
    setHasNavigated(false);
    // Crucial: Do NOT call jumpToMatch here! User must be able to continue typing freely.
  }, [searchQuery, isSearchOpen, note?.title, note?.body, isSourceMode, activeTipTapEditor]);

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    if (!hasNavigated) {
      setHasNavigated(true);
      jumpToMatch(0, matches);
      return;
    }
    const nextIdx = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIdx);
    jumpToMatch(nextIdx, matches);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    setHasNavigated(true);
    const prevIdx = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIdx);
    jumpToMatch(prevIdx, matches);
  };

  React.useEffect(() => {
    if (note && !note.title && !note.body) {
      titleInputRef.current?.focus();
    }
  }, [note?.id]);

  if (!note) {
    return (
      <main className="flex-1 flex flex-col justify-between bg-ctp-base overflow-hidden">
        <div />
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
            <Shield className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 mb-1">
            No Note Selected
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mb-5">
            Choose a note from the sidebar or create a new encrypted note to begin writing.
          </p>
          <div className="flex items-center space-x-3">
            {onNewNote && (
              <button
                onClick={onNewNote}
                className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-slate-950 text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>New Encrypted Note</span>
              </button>
            )}
            <button
              onClick={onToggleMobileSidebar}
              className="md:hidden px-4 py-2.5 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
            >
              Open Notes List
            </button>
          </div>
        </div>
        <div className="h-8 border-t border-slate-800/60 px-6 flex items-center text-[11px] text-slate-500 shrink-0 bg-ctp-base">
          <span className="font-mono text-slate-400 font-medium">v{APP_VERSION}</span>
        </div>
      </main>
    );
  }

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().replace(/^#/, '').toLowerCase();
      if (clean && !note.tags.includes(clean)) {
        onUpdateNote({ tags: [...note.tags, clean] });
      }
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateNote({ tags: note.tags.filter((t) => t !== tagToRemove) });
  };

  const textContent =
    activeTipTapEditor && !isSourceMode
      ? activeTipTapEditor.getText({ blockSeparator: '\n' })
      : stripMarkdown(note.body);

  const cleanText = textContent.trim();
  const wordTokens = cleanText
    ? cleanText.split(/\s+/).filter((w) => /\p{L}|\p{N}/u.test(w))
    : [];
  const wordCount = wordTokens.length;
  const charCount = cleanText.length;

  return (
    <main className="flex-1 flex flex-col bg-ctp-base overflow-hidden">
      {/* Editor Header / Action Bar */}
      <div className="h-12 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 bg-ctp-base/50">
        <div className="flex items-center space-x-2">
          <button
            onClick={onToggleMobileSidebar}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            title="Toggle Notes List"
          >
            <Menu className="w-4 h-4" />
          </button>

          <button
            onClick={() => onUpdateNote({ isPinned: !note.isPinned })}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors ${
              note.isPinned
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={note.isPinned ? 'Unpin Note' : 'Pin Note'}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => onUpdateNote({ isFavorite: !note.isFavorite })}
            className={`p-1.5 rounded-lg text-xs flex items-center space-x-1 transition-colors ${
              note.isFavorite
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={note.isFavorite ? 'Unfavorite' : 'Favorite'}
          >
            <Star className={`w-3.5 h-3.5 ${note.isFavorite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
            {isSaving || (isCloudConfigured && syncStatus === 'syncing') ? (
              <span className="text-amber-400 animate-pulse flex items-center gap-1 font-medium">
                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                <span>{isSaving ? 'Encrypting & saving...' : 'Syncing to cloud...'}</span>
              </span>
            ) : isCloudConfigured && syncStatus === 'synced' ? (
              <span className="flex items-center gap-1 text-emerald-400/80 font-medium">
                <CloudCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Sealed & Synced</span>
                <span className="sm:hidden">Synced</span>
              </span>
            ) : isCloudConfigured && syncStatus === 'error' ? (
              <span className="flex items-center gap-1 text-rose-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Sync Error</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400/80">
                <CheckCircle2 className="w-3 h-3" />
                <span className="hidden sm:inline">Sealed with XChaCha20</span>
                <span className="sm:hidden">Sealed</span>
              </span>
            )}
          </div>

          {note.isTrashed ? (
            <div className="flex items-center space-x-1">
              <button
                onClick={() => onUpdateNote({ isTrashed: false })}
                className="px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10 rounded-lg flex items-center space-x-1"
                title="Restore Note"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restore</span>
              </button>
              <button
                onClick={() => onDeleteNote(note.id, true)}
                className="px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg flex items-center space-x-1"
                title="Delete Permanently"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Erase</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => onDeleteNote(note.id, false)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
              title="Move to Trash"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Formatting Toolbar */}
      <EditorToolbar
        editor={activeTipTapEditor}
        isSourceMode={isSourceMode}
        onToggleSourceMode={() => setIsSourceMode(!isSourceMode)}
        isSearchOpen={isSearchOpen}
        onToggleSearch={() => setIsSearchOpen((prev) => !prev)}
      />

      {/* In-Text Search Bar */}
      {isSearchOpen && (
        <EditorSearchBar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          currentIndex={currentMatchIndex}
          totalMatches={matches.length}
          onNext={handleNextMatch}
          onPrev={handlePrevMatch}
          onClose={() => {
            setIsSearchOpen(false);
            setSearchQuery('');
            setMatches([]);
            if (activeTipTapEditor && !activeTipTapEditor.isDestroyed) {
              activeTipTapEditor.view.dispatch(
                activeTipTapEditor.state.tr.setMeta(searchHighlightPluginKey, {
                  searchTerm: '',
                  currentIndex: -1,
                })
              );
            }
          }}
        />
      )}

      {/* Title & Metadata Header */}
      <div className="px-6 pt-5 pb-2 shrink-0 space-y-3 max-w-4xl w-full mx-auto">
        <input
          ref={titleInputRef}
          type="text"
          value={note.title}
          onChange={(e) => onUpdateNote({ title: e.target.value })}
          placeholder="Untitled Note"
          className="w-full bg-transparent text-xl sm:text-2xl font-bold text-white placeholder:text-slate-600 focus:outline-none tracking-tight"
        />

        {/* Tags Chips & Input */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <Tag className="w-3 h-3 text-slate-500 mr-1 shrink-0" />
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-indigo-300 text-[11px]"
            >
              #{tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="text-slate-500 hover:text-slate-300 ml-0.5"
              >
                &times;
              </button>
            </span>
          ))}

          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleAddTag}
            placeholder="Add tag (press Enter)..."
            className="bg-transparent text-[11px] text-slate-300 placeholder:text-slate-600 focus:outline-none min-w-24 px-1"
          />
        </div>
      </div>

      {/* Main Body Area: TipTap Rich Editor OR Raw Markdown Source */}
      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-4xl w-full mx-auto flex flex-col">
        {isSourceMode ? (
          <RawMarkdownEditor
            value={note.body}
            onChange={(newMarkdown) => onUpdateNote({ body: newMarkdown })}
          />
        ) : (
          <RichMarkdownEditor
            key={note.id}
            noteId={note.id}
            content={note.body}
            onChange={(newMarkdown) => onUpdateNote({ body: newMarkdown })}
            onEditorReady={setActiveTipTapEditor}
          />
        )}
      </div>

      {/* Footer Info */}
      <div className="h-8 border-t border-slate-800/60 px-6 flex items-center justify-between text-[11px] text-slate-500 shrink-0 bg-ctp-base">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-slate-400 font-medium">v{APP_VERSION}</span>
          <span className="text-slate-700">•</span>
          <span>
            {wordCount} {wordCount === 1 ? 'word' : 'words'} • {charCount} {charCount === 1 ? 'character' : 'characters'}
          </span>
        </div>
        <div>
          Last updated: {new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </main>
  );
};
