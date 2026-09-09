import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';

interface RichMarkdownEditorProps {
  content: string;
  noteId: string;
  onChange: (markdown: string) => void;
  onEditorReady: (editor: Editor | null) => void;
}

export const RichMarkdownEditor: React.FC<RichMarkdownEditorProps> = ({
  content,
  noteId,
  onChange,
  onEditorReady,
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      Placeholder.configure({
        placeholder: 'Write your thoughts in Markdown... (e.g. # Header, - [ ] Task, **bold**)',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: 'text-indigo-400 hover:text-indigo-300 underline',
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[300px] text-slate-200 text-sm leading-relaxed',
      },
    },
    onUpdate: ({ editor: currentEditor }: { editor: Editor }) => {
      const markdown = currentEditor.storage.markdown.getMarkdown();
      onChange(markdown);
    },
  });

  // Notify parent of editor instance
  useEffect(() => {
    onEditorReady(editor);
    return () => {
      onEditorReady(null);
    };
  }, [editor, onEditorReady]);

  // When note switches, update content
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const currentMarkdown = editor.storage.markdown.getMarkdown();
      if (currentMarkdown !== content) {
        editor.commands.setContent(content);
      }
    }
  }, [noteId, editor, content]);

  return (
    <div className="w-full flex-1">
      <EditorContent editor={editor} className="min-h-[300px]" />
    </div>
  );
};
