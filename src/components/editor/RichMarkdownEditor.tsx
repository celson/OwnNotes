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
import { Slice, Fragment } from '@tiptap/pm/model';
import { createLowlight, common } from 'lowlight';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { SearchHighlightExtension } from './searchHighlightExtension.js';
import { serializeClipboardText } from './clipboardUtils.js';

const lowlight = createLowlight(common);

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
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
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
      SearchHighlightExtension,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[300px] text-slate-200 text-sm leading-relaxed',
      },
      clipboardTextSerializer: (slice, view) => {
        return serializeClipboardText(slice, view) as string;
      },
      handlePaste: (view, event) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const html = clipboardData.getData('text/html');
        const text = clipboardData.getData('text/plain');

        if (!text) return false;

        // Detect if pasted HTML comes from a terminal emulator (Ghostty, Alacritty, xterm, etc.)
        // Ghostty / terminals copy text/html with monospace pre blocks and ANSI style spans without semantic tags
        const isTerminalHtml = Boolean(
          html &&
          (
            (html.includes('font-family: monospace') && html.includes('white-space: pre')) ||
            html.includes('ghostty') ||
            html.includes('terminal') ||
            (!/<(h[1-6]|p|ul|ol|table|blockquote|a|img)\b/i.test(html) && /<(div|span)\b/i.test(html))
          )
        );

        if (isTerminalHtml) {
          event.preventDefault();
          const { state, dispatch } = view;

          // If inside a code block, insert as plain text directly
          if (state.selection.$from.parent.type.spec.code) {
            dispatch(state.tr.replaceSelectionWith(state.schema.text(text), false));
            return true;
          }

          // Single line paste: insert clean text directly
          const lines = text.split(/\r?\n/);
          if (lines.length <= 1) {
            dispatch(state.tr.insertText(text));
            return true;
          }

          // Multiline terminal paste: preserve clean paragraphs without HTML artifacts
          const paragraphs = lines.map((line) =>
            state.schema.nodes.paragraph.create(
              null,
              line ? state.schema.text(line) : undefined
            )
          );
          const fragment = Fragment.from(paragraphs);
          dispatch(state.tr.replaceSelection(new Slice(fragment, 1, 1)));
          return true;
        }

        return false;
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
