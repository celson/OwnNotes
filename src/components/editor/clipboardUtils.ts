import type { Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Custom clipboard text serializer for TipTap / ProseMirror.
 *
 * Prevents wrapping text copied from inside a code block in markdown backtick fences.
 * When a user selects text within a code block (such as a variable name, token,
 * or lines of code/JSON), this extracts the raw text content without markdown syntax.
 *
 * For selections outside of code blocks, returns undefined so that ProseMirror
 * delegates to the default / markdown serializer.
 */
export function serializeClipboardText(slice: Slice, view?: EditorView): string | undefined {
  if (!slice || slice.content.size === 0) {
    return undefined;
  }

  // 1. Check if the current selection is completely inside a code block node
  if (view && view.state && view.state.selection) {
    const { $from, $to } = view.state.selection;
    const fromIsCode = Boolean($from.parent?.type?.spec?.code || $from.parent?.type?.name === 'codeBlock');
    const toIsCode = Boolean($to.parent?.type?.spec?.code || $to.parent?.type?.name === 'codeBlock');

    if (fromIsCode && toIsCode && $from.parent === $to.parent) {
      const text = slice.content.textBetween(0, slice.content.size, '\n');
      return text;
    }
  }

  // 2. Check if the slice content consists solely of a single code block node
  if (slice.content.childCount === 1) {
    const firstChild = slice.content.firstChild;
    if (firstChild && (firstChild.type.spec.code || firstChild.type.name === 'codeBlock')) {
      const text = slice.content.textBetween(0, slice.content.size, '\n');
      return text;
    }
  }

  return undefined;
}
