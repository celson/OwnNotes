import React, { useState, useEffect } from 'react';
import {
  Star,
  Pin,
  Trash2,
  RotateCcw,
  Eye,
  Edit3,
  Tag,
  Menu,
  CheckCircle2,
  Shield,
} from 'lucide-react';
import type { NoteItem } from '../crypto/types.js';

interface EditorProps {
  note: NoteItem | null;
  onUpdateNote: (updated: Partial<NoteItem>) => void;
  onDeleteNote: (id: string, permanent?: boolean) => void;
  onToggleMobileSidebar: () => void;
  isSaving: boolean;
}

export const Editor: React.FC<EditorProps> = ({
  note,
  onUpdateNote,
  onDeleteNote,
  onToggleMobileSidebar,
  isSaving,
}) => {
  const [isPreview, setIsPreview] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // Reset preview mode when switching notes
  useEffect(() => {
    setIsPreview(false);
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
        <p className="text-xs text-slate-500 max-w-sm mb-4">
          Choose a note from the sidebar or create a new encrypted note to begin writing.
        </p>
        <button
          onClick={onToggleMobileSidebar}
          className="md:hidden px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg"
        >
          Open Notes List
        </button>
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

  const renderSimpleMarkdown = (text: string) => {
    // Lightweight markdown parser for instant preview without heavy bundles
    const lines = text.split('\n');
    return (
      <div className="space-y-2 text-slate-200 text-sm leading-relaxed">
        {lines.map((line, idx) => {
          if (line.startsWith('# ')) {
            return (
              <h1 key={idx} className="text-2xl font-bold text-white border-b border-slate-800 pb-2 mt-4 mb-2">
                {line.slice(2)}
              </h1>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h2 key={idx} className="text-xl font-bold text-slate-100 border-b border-slate-800/80 pb-1 mt-3 mb-2">
                {line.slice(3)}
              </h2>
            );
          }
          if (line.startsWith('### ')) {
            return (
              <h3 key={idx} className="text-lg font-semibold text-slate-200 mt-2 mb-1">
                {line.slice(4)}
              </h3>
            );
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <li key={idx} className="ml-5 list-disc text-slate-300">
                {line.slice(2)}
              </li>
            );
          }
          if (line.startsWith('> ')) {
            return (
              <blockquote key={idx} className="border-l-4 border-indigo-500 pl-3 italic text-slate-400 my-2">
                {line.slice(2)}
              </blockquote>
            );
          }
          if (line.startsWith('```')) {
            return (
              <div key={idx} className="font-mono text-xs bg-slate-900 border border-slate-800 p-2 rounded-lg text-slate-300 my-1">
                {line}
              </div>
            );
          }
          if (!line.trim()) {
            return <div key={idx} className="h-2" />;
          }
          return (
            <p key={idx} className="text-slate-300">
              {line}
            </p>
          );
        })}
      </div>
    );
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

          <button
            onClick={() => setIsPreview(!isPreview)}
            className={`px-2 py-1 rounded-lg text-xs flex items-center space-x-1 border transition-colors ${
              isPreview
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {isPreview ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            <span>{isPreview ? 'Edit' : 'Preview'}</span>
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

      {/* Title & Metadata Header */}
      <div className="px-6 pt-5 pb-2 shrink-0 space-y-3 max-w-4xl w-full mx-auto">
        <input
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

      {/* Main Body Area */}
      <div className="flex-1 overflow-y-auto px-6 py-3 max-w-4xl w-full mx-auto">
        {isPreview ? (
          <div className="prose prose-invert max-w-none">
            {renderSimpleMarkdown(note.body)}
          </div>
        ) : (
          <textarea
            value={note.body}
            onChange={(e) => onUpdateNote({ body: e.target.value })}
            placeholder="Write markdown here... Note content is encrypted with your private key in real-time."
            className="w-full h-full min-h-[350px] bg-transparent text-slate-200 text-sm leading-relaxed placeholder:text-slate-600 focus:outline-none resize-none font-sans"
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
