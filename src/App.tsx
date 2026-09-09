import React, { useState, useEffect, useRef, useCallback } from 'react';
import { vaultKeyManager } from './services/vaultKeyManager.js';
import { storageAdapter } from './services/storage/indexedDbAdapter.js';
import { encryptNote, decryptNote, wipe } from './crypto/index.js';
import type { NoteItem } from './crypto/types.js';
import { supabaseSync, isSupabaseConfigured, type SyncStatus } from './services/supabase/index.js';

import { SecurityHeader } from './components/SecurityHeader.js';
import { Sidebar, type FilterType } from './components/Sidebar.js';
import { Editor } from './components/Editor.js';
import { UnlockModal } from './components/UnlockModal.js';
import { OnboardingModal } from './components/OnboardingModal.js';
import { SettingsModal } from './components/SettingsModal.js';

export const App: React.FC = () => {
  const [isUnlocked, setIsUnlocked] = useState(() => vaultKeyManager.isUnlocked());
  const [, setHasExistingVault] = useState<boolean | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Decrypted note items held in volatile React state
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // UI & Sync state
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => vaultKeyManager.getAutoLockMinutes());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => supabaseSync.getStatus());
  const [cloudConfigured, setCloudConfigured] = useState(() => isSupabaseConfigured());

  // Debounce save timer
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if vault exists on mount
  useEffect(() => {
    storageAdapter.hasExistingVault().then((exists) => {
      setHasExistingVault(exists);
      if (!exists) {
        setShowCreateModal(true);
      }
    });

    const unregLock = vaultKeyManager.onLock(() => {
      setIsUnlocked(false);
      // Evict decrypted plaintext from React state immediately
      setNotes([]);
      setSelectedNoteId(null);
    });

    const unregUnlock = vaultKeyManager.onUnlock(() => {
      setIsUnlocked(true);
      setShowCreateModal(false);
    });

    const unregSync = supabaseSync.onStatusChange((status) => {
      setSyncStatus(status);
    });

    return () => {
      unregLock();
      unregUnlock();
      unregSync();
    };
  }, []);

  // Load and decrypt notes when vault is unlocked
  const loadDecryptedNotes = useCallback(async () => {
    if (!vaultKeyManager.isUnlocked()) return;

    try {
      const records = await storageAdapter.getAllEncrypted();
      const key = vaultKeyManager.getKeyCopy();

      const decryptedList: NoteItem[] = [];
      for (const rec of records) {
        try {
          const item = decryptNote(rec, key);
          decryptedList.push(item);
        } catch (decErr) {
          console.error(`Failed to decrypt note ${rec.id}:`, decErr);
        }
      }

      wipe(key);

      // If this is a brand-new vault with 0 notes, seed a welcome note!
      if (decryptedList.length === 0 && records.length === 0) {
        const welcomeNote: NoteItem = {
          id: crypto.randomUUID(),
          title: 'Welcome to OwnNotes 🔐',
          body: `# Welcome to OwnNotes!

OwnNotes is your private, zero-knowledge encrypted vault.

### 🛡️ Why your notes are secure:
- **Zero-Persistence Keys**: Your encryption key is NEVER written to local storage, cookies, or files.
- **XChaCha20-Poly1305**: Encrypted at rest and in transit with 24-byte random nonces.
- **RAM-only Lifecycle**: Keys reside solely in memory and are overwritten with zeroes upon locking.
- **Full Privacy**: Titles, bodies, and tags are encrypted inside the ciphertext payload.
- **Supabase Cloud Sync**: Encrypted records sync across devices. Supabase sees only ciphertext!

Enjoy private note taking!
`,
          tags: ['welcome', 'privacy'],
          category: 'Getting Started',
          isFavorite: true,
          isPinned: true,
          isTrashed: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const encKey = vaultKeyManager.getKeyCopy();
        const encRec = encryptNote(welcomeNote, encKey);
        wipe(encKey);
        await storageAdapter.saveEncrypted(encRec);

        if (isSupabaseConfigured()) {
          supabaseSync.pushRecord(encRec);
        }

        decryptedList.push(welcomeNote);
      }

      // Sort notes: pinned first, then updatedAt desc
      decryptedList.sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0) || b.updatedAt - a.updatedAt);

      setNotes(decryptedList);
      if (decryptedList.length > 0) {
        setSelectedNoteId(decryptedList[0].id);
      }
    } catch (err) {
      console.error('Error loading encrypted notes:', err);
    }
  }, []);

  // Initial load and cloud sync trigger on unlock
  useEffect(() => {
    if (isUnlocked) {
      loadDecryptedNotes().then(() => {
        if (isSupabaseConfigured()) {
          supabaseSync.syncAll(loadDecryptedNotes);
        }
      });

      // Subscribe to real-time sync across devices
      const unsubscribeRealtime = supabaseSync.subscribeRealtime(() => {
        loadDecryptedNotes();
      });

      return () => {
        unsubscribeRealtime();
      };
    }
  }, [isUnlocked, loadDecryptedNotes]);

  // Persist a note encrypted
  const persistNoteEncrypted = async (noteToSave: NoteItem) => {
    if (!vaultKeyManager.isUnlocked()) return;

    try {
      setIsSaving(true);
      const key = vaultKeyManager.getKeyCopy();
      const record = encryptNote(noteToSave, key);
      wipe(key);

      await storageAdapter.saveEncrypted(record);

      // Cloud Sync push
      if (isSupabaseConfigured()) {
        supabaseSync.pushRecord(record, noteToSave.isTrashed);
      }
    } catch (err) {
      console.error('Error encrypting and saving note:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Create new note
  const handleNewNote = () => {
    const newNote: NoteItem = {
      id: crypto.randomUUID(),
      title: '',
      body: '',
      tags: [],
      category: '',
      isFavorite: false,
      isPinned: false,
      isTrashed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(newNote.id);
    persistNoteEncrypted(newNote);
  };

  // Update selected note
  const handleUpdateNote = (updatedFields: Partial<NoteItem>) => {
    if (!selectedNoteId) return;

    setNotes((prev) => {
      return prev.map((n) => {
        if (n.id === selectedNoteId) {
          const updated = {
            ...n,
            ...updatedFields,
            updatedAt: Date.now(),
          };

          // Debounce encryption and storage write
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => {
            persistNoteEncrypted(updated);
          }, 350);

          return updated;
        }
        return n;
      });
    });
  };

  // Delete or move to trash
  const handleDeleteNote = async (id: string, permanent = false) => {
    if (permanent) {
      await storageAdapter.deleteEncrypted(id);
      if (isSupabaseConfigured()) {
        supabaseSync.pushRecord(
          { id, nonce: '', ciphertext: '', createdAt: 0, updatedAt: Date.now() },
          true
        );
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
      }
    } else {
      handleUpdateNote({ isTrashed: true });
    }
  };

  const handleLockVault = () => {
    vaultKeyManager.lock();
  };

  const handlePurgeVault = async () => {
    await storageAdapter.resetVault();
    vaultKeyManager.lock();
    setHasExistingVault(false);
    setShowCreateModal(true);
    setIsSettingsOpen(false);
  };

  const handleChangeAutoLockMinutes = (mins: number) => {
    vaultKeyManager.setAutoLockMinutes(mins);
    setAutoLockMinutes(mins);
  };

  const handleManualSync = async () => {
    if (isSupabaseConfigured()) {
      await supabaseSync.syncAll(loadDecryptedNotes);
    }
  };

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 antialiased overflow-hidden font-sans">
      {/* Top Security Header */}
      <SecurityHeader
        onLock={handleLockVault}
        onOpenSettings={() => setIsSettingsOpen(true)}
        autoLockMinutes={autoLockMinutes}
        syncStatus={syncStatus}
        onManualSync={handleManualSync}
        isCloudConfigured={cloudConfigured}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          notes={notes}
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          onNewNote={handleNewNote}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        <Editor
          note={selectedNote}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          isSaving={isSaving}
        />
      </div>

      {/* Unlock Dialog (if locked and not creating) */}
      {!isUnlocked && !showCreateModal && (
        <UnlockModal
          onUnlocked={() => {
            setIsUnlocked(true);
            setHasExistingVault(true);
          }}
          onSwitchToCreate={() => setShowCreateModal(true)}
        />
      )}

      {/* Onboarding Dialog (for new vaults) */}
      {!isUnlocked && showCreateModal && (
        <OnboardingModal
          onVaultCreated={() => {
            setIsUnlocked(true);
            setHasExistingVault(true);
            setShowCreateModal(false);
          }}
          onSwitchToUnlock={() => setShowCreateModal(false)}
        />
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        autoLockMinutes={autoLockMinutes}
        onChangeAutoLockMinutes={handleChangeAutoLockMinutes}
        onLockVault={handleLockVault}
        onPurgeVault={handlePurgeVault}
        onReloadNotes={loadDecryptedNotes}
        onSyncStatusChange={() => setCloudConfigured(isSupabaseConfigured())}
      />
    </div>
  );
};
