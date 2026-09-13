import React, { useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

interface EditorSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  currentIndex: number;
  totalMatches: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export const EditorSearchBar: React.FC<EditorSearchBarProps> = ({
  query,
  onQueryChange,
  currentIndex,
  totalMatches,
  onNext,
  onPrev,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus search input automatically when opened
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/95 border-b border-slate-800/80 backdrop-blur-md shrink-0 shadow-lg z-20">
      <div className="flex items-center gap-2 flex-1 max-w-md bg-slate-950/90 border border-slate-800 focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/30 rounded-lg px-2.5 py-1 transition-all">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search in note text (Enter to advance)..."
          className="bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none w-full"
        />
        {query && (
          <span className="text-[11px] shrink-0 font-mono select-none">
            {totalMatches > 0 ? (
              <span className="text-indigo-400 font-semibold">
                {currentIndex + 1} of {totalMatches}
              </span>
            ) : (
              <span className="text-rose-400">No results</span>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={totalMatches === 0}
          className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={totalMatches === 0}
          className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
          title="Next match (Enter)"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <div className="w-px h-3.5 bg-slate-800 mx-1" />
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          title="Close search (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
