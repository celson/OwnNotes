import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  FileText,
  Star,
  Pin,
  Trash,
  Tag,
  Sparkles,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import type { NoteItem } from '../crypto/types.js';
import { APP_VERSION, checkForUpdates, type UpdateInfo } from '../services/updateService.js';

export type FilterType = 'all' | 'favorites' | 'pinned' | 'trash';

interface SidebarProps {
  notes: NoteItem[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: FilterType;
  onFilterChange: (f: FilterType) => void;
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  selectedTag,
  onSelectTag,
  isOpenMobile,
  onCloseMobile,
}) => {
  // In-app update state
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [checkFeedback, setCheckFeedback] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  const handleCheckUpdate = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isCheckingUpdate) return;
    try {
      setIsCheckingUpdate(true);
      setCheckFeedback(null);
      const res = await checkForUpdates();
      setUpdateInfo(res);
      if (res.hasUpdate) {
        // Shown via badge
      } else if (!res.error) {
        setCheckFeedback({ type: 'success', text: 'Atualizado' });
        setTimeout(() => setCheckFeedback(null), 3500);
      } else {
        setCheckFeedback({ type: 'info', text: 'Checar' });
      }
    } catch {
      setCheckFeedback({ type: 'info', text: 'Checar' });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    // Check quietly in background on mount after 3 seconds
    const timer = setTimeout(() => {
      checkForUpdates().then((res) => {
        setUpdateInfo(res);
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Collect all unique tags and counts
  const tagCounts: Record<string, number> = {};
  for (const n of notes) {
    if (!n.isTrashed && n.tags) {
      for (const t of n.tags) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
    }
  }
  const allTags = Object.keys(tagCounts).sort();

  // Filter notes
  const filteredNotes = notes.filter((note) => {
    // Trash filter isolation
    if (activeFilter === 'trash') {
      if (!note.isTrashed) return false;
    } else {
      if (note.isTrashed) return false;
    }

    if (activeFilter === 'favorites' && !note.isFavorite) return false;
    if (activeFilter === 'pinned' && !note.isPinned) return false;

    if (selectedTag && (!note.tags || !note.tags.includes(selectedTag))) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const inTitle = note.title.toLowerCase().includes(q);
      const inBody = note.body.toLowerCase().includes(q);
      const inTags = note.tags?.some((t) => t.toLowerCase().includes(q));
      if (!inTitle && !inBody && !inTags) return false;
    }

    return true;
  });

  // Sort notes: pinned first, then by updatedAt descending
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-950/70 z-20 md:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-72 sm:w-80 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Action */}
        <div className="p-3 border-b border-slate-800 space-y-2">
          <button
            onClick={() => {
              onNewNote();
              if (isOpenMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-slate-950 text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Encrypted Note</span>
          </button>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search decrypted notes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Categories / Navigation */}
        <div className="px-2.5 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 gap-1">
          <button
            onClick={() => {
              onFilterChange('all');
              onSelectTag(null);
            }}
            className={`flex items-center space-x-1.5 px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeFilter === 'all' && !selectedTag
                ? 'bg-slate-800 text-indigo-400 font-semibold'
                : 'hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>All ({notes.filter((n) => !n.isTrashed).length})</span>
          </button>

          <button
            onClick={() => {
              onFilterChange('favorites');
              onSelectTag(null);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeFilter === 'favorites'
                ? 'bg-slate-800 text-amber-400 font-semibold'
                : 'hover:text-slate-200'
            }`}
            title="Starred Notes"
          >
            <Star className="w-3.5 h-3.5 shrink-0" />
            <span>Favs</span>
          </button>

          <button
            onClick={() => {
              onFilterChange('pinned');
              onSelectTag(null);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeFilter === 'pinned'
                ? 'bg-slate-800 text-indigo-400 font-semibold'
                : 'hover:text-slate-200'
            }`}
            title="Pinned Notes"
          >
            <Pin className="w-3.5 h-3.5 shrink-0" />
            <span>Pinned</span>
          </button>

          <button
            onClick={() => {
              onFilterChange('trash');
              onSelectTag(null);
            }}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md transition-colors shrink-0 ${
              activeFilter === 'trash'
                ? 'bg-slate-800 text-rose-400 font-semibold'
                : 'hover:text-slate-200'
            }`}
            title="Trash"
          >
            <Trash className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Tags Bar (if any) */}
        {allTags.length > 0 && (
          <div className="px-3 py-1.5 border-b border-slate-800/80 flex items-center space-x-1 overflow-x-auto text-[11px] scrollbar-none">
            <span className="text-slate-500 flex items-center gap-0.5">
              <Tag className="w-2.5 h-2.5" />
            </span>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                className={`px-2 py-0.5 rounded-full border transition-colors whitespace-nowrap ${
                  selectedTag === tag
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                }`}
              >
                #{tag} <span className="opacity-60">{tagCounts[tag]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
          {sortedNotes.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              {searchQuery
                ? 'No notes matching search'
                : activeFilter === 'trash'
                ? 'Trash is empty'
                : 'No notes yet. Click "+ New" to begin.'}
            </div>
          ) : (
            sortedNotes.map((note) => {
              const isSelected = note.id === selectedNoteId;
              return (
                <div
                  key={note.id}
                  onClick={() => {
                    onSelectNote(note.id);
                    if (isOpenMobile) onCloseMobile();
                  }}
                  className={`p-3 cursor-pointer transition-colors group ${
                    isSelected
                      ? 'bg-indigo-950/40 border-l-2 border-indigo-500'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <h4
                      className={`text-xs font-semibold truncate ${
                        isSelected ? 'text-indigo-200' : 'text-slate-200'
                      }`}
                    >
                      {note.title.trim() || 'Untitled Note'}
                    </h4>
                    <div className="flex items-center space-x-1 shrink-0">
                      {note.isPinned && (
                        <Pin className="w-3 h-3 text-indigo-400 fill-indigo-400/20" />
                      )}
                      {note.isFavorite && (
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      )}
                      <span className="text-[10px] text-slate-500">
                        {formatDate(note.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {note.body.trim() || 'No additional text'}
                  </p>

                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {note.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded-md"
                        >
                          #{tag}
                        </span>
                      ))}
                      {note.tags.length > 3 && (
                        <span className="text-[10px] text-slate-500">
                          +{note.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer: App Version & In-App Update Checker */}
        <div className="h-9 px-3 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400 shrink-0 select-none">
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="font-semibold text-slate-200 text-xs shrink-0">OwnNotes</span>
            <span className="text-slate-400 font-mono text-[11px] shrink-0">v{APP_VERSION}</span>
          </div>

          <div className="flex items-center shrink-0">
            {updateInfo?.hasUpdate ? (
              <a
                href={updateInfo.releaseUrl || 'https://github.com/celson/OwnNotes/releases'}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 font-medium transition-colors text-[11px] animate-pulse shrink-0"
                title={`Nova versão v${updateInfo.latestVersion} disponível! Clique para baixar.`}
              >
                <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>v{updateInfo.latestVersion}</span>
              </a>
            ) : isCheckingUpdate ? (
              <span className="flex items-center space-x-1 text-slate-400 text-[11px] shrink-0">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400 shrink-0" />
                <span>Checando...</span>
              </span>
            ) : checkFeedback ? (
              <button
                type="button"
                onClick={handleCheckUpdate}
                className={`flex items-center space-x-1 text-[11px] cursor-pointer shrink-0 ${
                  checkFeedback.type === 'success' ? 'text-emerald-400' : 'text-slate-300 hover:text-white'
                }`}
                title="Clique para checar novamente"
              >
                {checkFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <RefreshCw className="w-3 h-3 text-slate-400 shrink-0" />
                )}
                <span>{checkFeedback.text}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckUpdate}
                className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800/60 transition-colors cursor-pointer text-[11px] shrink-0"
                title="Verificar se há novas versões no GitHub"
              >
                <RefreshCw className="w-3 h-3 shrink-0" />
                <span>Verificar</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
