import { describe, it, expect } from 'vitest';
import { Schema, Slice, Fragment } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { serializeClipboardText } from '../src/components/editor/clipboardUtils.js';

describe('Editor Clipboard Serialization for Code Blocks', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: { group: 'block', content: 'inline*' },
      codeBlock: {
        group: 'block',
        content: 'text*',
        code: true,
        attrs: { language: { default: 'plaintext' } },
      },
      text: { group: 'inline' },
    },
  });

  it('extracts pure text without markdown backtick fences when copying inside a code block', () => {
    // User selected only "database_dbname" inside codeBlock
    const codeBlockNode = schema.nodes.codeBlock.create(
      { language: 'jsx' },
      schema.text('database_dbname')
    );
    const slice = new Slice(Fragment.from(codeBlockNode), 1, 1);

    const mockView = {
      state: {
        selection: {
          $from: { parent: codeBlockNode },
          $to: { parent: codeBlockNode },
        },
      },
    } as unknown as EditorView;

    const result = serializeClipboardText(slice, mockView);
    expect(result).toBe('database_dbname');
    expect(result).not.toContain('```');
  });

  it('preserves multiline indentation and line breaks without markdown fences', () => {
    const multilineCode = `{\n  "database_dbname": "card-vault-api-db",\n  "database_port": "5432"\n}`;
    const codeBlockNode = schema.nodes.codeBlock.create(
      { language: 'json' },
      schema.text(multilineCode)
    );
    const slice = new Slice(Fragment.from(codeBlockNode), 1, 1);

    const mockView = {
      state: {
        selection: {
          $from: { parent: codeBlockNode },
          $to: { parent: codeBlockNode },
        },
      },
    } as unknown as EditorView;

    const result = serializeClipboardText(slice, mockView);
    expect(result).toBe(multilineCode);
    expect(result).not.toContain('```');
  });

  it('extracts raw code when the copied slice is solely an entire code block node', () => {
    const codeBlockNode = schema.nodes.codeBlock.create(
      { language: 'jsx' },
      schema.text('const x = 42;')
    );
    // Slice with depth 0 represents selecting the whole block node
    const slice = new Slice(Fragment.from(codeBlockNode), 0, 0);

    const result = serializeClipboardText(slice);
    expect(result).toBe('const x = 42;');
  });

  it('delegates to default serializer when selection is in a regular paragraph', () => {
    const paragraphNode = schema.nodes.paragraph.create(
      null,
      schema.text('This is standard paragraph text.')
    );
    const slice = new Slice(Fragment.from(paragraphNode), 1, 1);

    const mockView = {
      state: {
        selection: {
          $from: { parent: paragraphNode },
          $to: { parent: paragraphNode },
        },
      },
    } as unknown as EditorView;

    const result = serializeClipboardText(slice, mockView);
    expect(result).toBeUndefined();
  });

  it('delegates when selection spans across multiple blocks (mixed paragraph and codeBlock)', () => {
    const paragraphNode = schema.nodes.paragraph.create(null, schema.text('Intro text:'));
    const codeBlockNode = schema.nodes.codeBlock.create({ language: 'bash' }, schema.text('npm test'));
    const slice = new Slice(Fragment.from([paragraphNode, codeBlockNode]), 1, 1);

    const mockView = {
      state: {
        selection: {
          $from: { parent: paragraphNode },
          $to: { parent: codeBlockNode },
        },
      },
    } as unknown as EditorView;

    const result = serializeClipboardText(slice, mockView);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty slice', () => {
    const slice = new Slice(Fragment.empty, 0, 0);
    const result = serializeClipboardText(slice);
    expect(result).toBeUndefined();
  });
});
