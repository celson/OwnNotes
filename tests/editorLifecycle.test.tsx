// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { Editor } from '../src/components/Editor.js';
import { ErrorBoundary } from '../src/components/ErrorBoundary.js';
import type { NoteItem } from '../src/crypto/types.js';

afterEach(() => {
  cleanup();
});

const mockNote: NoteItem = {
  id: 'test-note-1',
  title: 'Test Note 1',
  body: 'Hello World Content',
  tags: ['testing'],
  isPinned: false,
  isFavorite: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isTrashed: false,
};

const mockNote2: NoteItem = {
  id: 'test-note-2',
  title: 'Test Note 2',
  body: 'Another note body',
  tags: ['second'],
  isPinned: true,
  isFavorite: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isTrashed: false,
};

describe('Editor Lifecycle & Hook Order Regression Tests', () => {
  it('renders EmptyState when note is null without throwing hook errors', () => {
    render(
      <Editor
        note={null}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onToggleMobileSidebar={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByText(/No Note Selected/i)).toBeTruthy();
  });

  it('transitions smoothly from note=null to note=sampleNote without hook order violation (React error #310)', async () => {
    const { rerender } = render(
      <Editor
        note={null}
        onUpdateNote={vi.fn()}
        onDeleteNote={vi.fn()}
        onToggleMobileSidebar={vi.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByText(/No Note Selected/i)).toBeTruthy();

    // Rerender with active note
    await act(async () => {
      rerender(
        <Editor
          note={mockNote}
          onUpdateNote={vi.fn()}
          onDeleteNote={vi.fn()}
          onToggleMobileSidebar={vi.fn()}
          isSaving={false}
        />
      );
    });

    // Expect note title input to be rendered and filled
    const titleInput = screen.getByPlaceholderText('Untitled Note') as HTMLInputElement;
    expect(titleInput.value).toBe('Test Note 1');

    // Switch to another note (tests note switching lifecycle)
    await act(async () => {
      rerender(
        <Editor
          note={mockNote2}
          onUpdateNote={vi.fn()}
          onDeleteNote={vi.fn()}
          onToggleMobileSidebar={vi.fn()}
          isSaving={false}
        />
      );
    });

    expect(titleInput.value).toBe('Test Note 2');

    // Switch back to null (tests unmounting note back to empty state)
    await act(async () => {
      rerender(
        <Editor
          note={null}
          onUpdateNote={vi.fn()}
          onDeleteNote={vi.fn()}
          onToggleMobileSidebar={vi.fn()}
          isSaving={false}
        />
      );
    });

    expect(screen.getByText(/No Note Selected/i)).toBeTruthy();
  });
});

describe('ErrorBoundary Protection Tests', () => {
  it('renders fallback UI when child component throws a runtime error', () => {
    const FaultyComponent: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
      if (shouldThrow) {
        throw new Error('Simulated runtime crash in child');
      }
      return <div>Normal Content</div>;
    };

    // Spy on console.error to avoid cluttering test output with expected error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeTruthy();

    rerender(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Ops! Algo deu errado')).toBeTruthy();
    expect(screen.getByText(/Simulated runtime crash in child/)).toBeTruthy();

    spy.mockRestore();
  });

  it('supports custom fallback node when provided', () => {
    const FaultyComponent: React.FC = () => {
      throw new Error('Crash');
    };

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom Fallback</div>}>
        <FaultyComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('custom-fallback')).toBeTruthy();
    expect(screen.getByText('Custom Fallback')).toBeTruthy();

    spy.mockRestore();
  });
});
