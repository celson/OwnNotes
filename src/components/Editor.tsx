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
} from 'lucide-react';
import type { NoteItem } from '../crypto/types.js';
import { EditorToolbar } from './editor/EditorToolbar.js';
import { RichMarkdownEditor } from './editor/RichMarkdownEditor.js';
import { RawMarkdownEditor } from './editor/RawMarkdownEditor.js';

interface EditorProps {
  note: NoteItem | null;
  onUpdateNote: (updated: Partial<NoteItem>) => void;
  onDeleteNote: (id: string, permanent?: boolean) => void;
  onNewNote?: () => void;
  onToggleMobileSidebar: () => void;
  isSaving: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  note,
  onUpdateNote,
  onDeleteNote,
  onNewNote,
  onToggleMobileSidebar,
  isSaving,
}) => {
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [activeTipTapEditor, setActiveTipTapEditor] = useState<TipTapEditorInstance | null>(null);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (note && !note.title && !note.body) {
      titleInputRef.current?.focus();
    }
  }, [note?.id]);

  if (!note) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
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
              className="flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
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

  const wordCount = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const charCount = note.body.length;

  return (
    <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
      {/* Editor Header / Action Bar */}
      <div className="h-12 border-b border-slate-800/80 px-4 flex items-center justify-between shrink-0 bg-slate-950/50">
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
          <div className="hidden sm:flex items-center space-x-1.5 text-[11px] text-slate-500">
            {isSaving ? (
              <span className="text-amber-400 animate-pulse">Encrypting & saving...</span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400/80">
                <CheckCircle2 className="w-3 h-3" />
                Sealed with XChaCha20
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
      />

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
      <div className="h-8 border-t border-slate-800/60 px-6 flex items-center justify-between text-[11px] text-slate-500 shrink-0 bg-slate-950">
        <div>
          {wordCount} words • {charCount} characters
        </div>
        <div>
          Last updated: {new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </main>
  );
};
