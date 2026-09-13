import React from 'react';
import type { Editor } from '@tiptap/core';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Terminal,
  Table as TableIcon,
  Minus,
  Link as LinkIcon,
  Undo2,
  Redo2,
  FileCode2,
  Eye,
  Search,
} from 'lucide-react';

interface EditorToolbarProps {
  editor: Editor | null;
  isSourceMode: boolean;
  onToggleSourceMode: () => void;
  isSearchOpen?: boolean;
  onToggleSearch?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  editor,
  isSourceMode,
  onToggleSourceMode,
  isSearchOpen = false,
  onToggleSearch,
}) => {
  if (!editor && !isSourceMode) return null;

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const insertTable = () => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const btnClass = (active: boolean, disabled?: boolean) => `
    p-1.5 rounded-md text-xs transition-colors flex items-center justify-center
    ${disabled ? 'opacity-30 cursor-not-allowed text-slate-600' : 'cursor-pointer'}
    ${
      active
        ? 'bg-indigo-600 text-white shadow-xs'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
    }
  `;

  return (
    <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-1.5 bg-slate-900/60 overflow-x-auto scrollbar-none gap-2 shrink-0">
      {/* Formatting Tools (Active only in WYSIWYG mode) */}
      <div className="flex items-center space-x-1 shrink-0">
        {!isSourceMode && editor ? (
          <>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={btnClass(editor.isActive('bold'))}
              title="Bold (Ctrl+B)"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={btnClass(editor.isActive('italic'))}
              title="Italic (Ctrl+I)"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={btnClass(editor.isActive('strike'))}
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleCode().run()}
              className={btnClass(editor.isActive('code'))}
              title="Inline Code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              className={btnClass(editor.isActive('heading', { level: 1 }))}
              title="Heading 1 (#)"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={btnClass(editor.isActive('heading', { level: 2 }))}
              title="Heading 2 (##)"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={btnClass(editor.isActive('heading', { level: 3 }))}
              title="Heading 3 (###)"
            >
              <Heading3 className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              className={btnClass(editor.isActive('taskList'))}
              title="Task List (- [ ])"
            >
              <ListTodo className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={btnClass(editor.isActive('bulletList'))}
              title="Bullet List (-)"
            >
              <List className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={btnClass(editor.isActive('orderedList'))}
              title="Numbered List (1.)"
            >
              <ListOrdered className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={btnClass(editor.isActive('blockquote'))}
              title="Blockquote (>)"
            >
              <Quote className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={btnClass(editor.isActive('codeBlock'))}
              title="Code Block (```)"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={insertTable}
              className={btnClass(editor.isActive('table'))}
              title="Insert Table"
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              className={btnClass(false)}
              title="Horizontal Rule (---)"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={setLink}
              className={btnClass(editor.isActive('link'))}
              title="Add Link"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-slate-800 mx-1" />

            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className={btnClass(false, !editor.can().undo())}
              title="Undo"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className={btnClass(false, !editor.can().redo())}
              title="Redo"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5 px-1 py-1">
            <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
            Raw Markdown Source Mode
          </span>
        )}
      </div>

      {/* Search & Mode Switch Buttons */}
      <div className="shrink-0 flex items-center space-x-1.5">
        {onToggleSearch && (
          <button
            type="button"
            onClick={onToggleSearch}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              isSearchOpen
                ? 'bg-indigo-600 text-slate-950 border-indigo-500 font-bold shadow-sm shadow-indigo-600/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
            }`}
            title="Search in note (Ctrl+F)"
          >
            <Search className={`w-3.5 h-3.5 ${isSearchOpen ? 'text-slate-950' : 'text-indigo-400'}`} />
            <span>Search</span>
          </button>
        )}

        {/* Editor Mode: Single Button toggling between Source and MarkDown */}
        <button
          type="button"
          onClick={onToggleSourceMode}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            isSourceMode
              ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/30'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
          }`}
          title={isSourceMode ? 'Switch to Rich Text Editor' : 'Switch to Raw Markdown Source'}
        >
          {isSourceMode ? (
            <>
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              <span>MarkDown</span>
            </>
          ) : (
            <>
              <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Source</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
