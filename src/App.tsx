import React, { useState, useEffect, useRef, useCallback } from 'react';
import { vaultKeyManager } from './services/vaultKeyManager.js';
import { storageAdapter } from './services/storage/indexedDbAdapter.js';
import { encryptNote, decryptNote, wipe, generateUUID } from './crypto/index.js';
import type { NoteItem } from './crypto/types.js';
import { supabaseSync, isSupabaseConfigured, type SyncStatus } from './services/supabase/index.js';
import { biometricService } from './services/biometricService.js';

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
  const selectedNoteIdRef = useRef<string | null>(null);
  selectedNoteIdRef.current = selectedNoteId;

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
      // The sync proof is gone now; force re-claim on next unlock/sync.
      supabaseSync.resetClaim();
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
          id: generateUUID(),
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

      setNotes((prevNotes) => {
        const currentSelectedId = selectedNoteIdRef.current;
        const activeDraft = currentSelectedId ? prevNotes.find((p) => p.id === currentSelectedId) : null;

        // The stored decryptedList is the source of truth; never resurrect deleted notes from prevNotes!
        return decryptedList.map((n) => {
          if (activeDraft && n.id === activeDraft.id && saveTimeoutRef.current) {
            // Retain active unpersisted typing draft while user is editing
            return activeDraft;
          }
          return n;
        });
      });

      setSelectedNoteId((prevId) => {
        // If the current note still exists in storage, preserve selection
        if (prevId && decryptedList.some((n) => n.id === prevId)) {
          return prevId;
        }
        // If the selected note was deleted remotely, select the first visible non-trashed note, or first note, or null
        const firstVisible = decryptedList.find((n) => !n.isTrashed);
        return firstVisible ? firstVisible.id : (decryptedList.length > 0 ? decryptedList[0].id : null);
      });
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
        supabaseSync.pushRecord(record, false);
      }
    } catch (err) {
      console.error('Error encrypting and saving note:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Create new note
  const handleNewNote = async () => {
    // Reset filters and search so user immediately sees their new note
    setActiveFilter('all');
    setSelectedTag(null);
    setSearchQuery('');

    const newNote: NoteItem = {
      id: generateUUID(),
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
    await persistNoteEncrypted(newNote);
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
      setSelectedNoteId((prevId) => {
        if (prevId === id) {
          const remaining = notes.filter((n) => n.id !== id && !n.isTrashed);
          return remaining.length > 0 ? remaining[0].id : null;
        }
        return prevId;
      });
    } else {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      const noteToTrash = notes.find((n) => n.id === id);
      if (noteToTrash) {
        const updated = { ...noteToTrash, isTrashed: true, updatedAt: Date.now() };
        setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
        await persistNoteEncrypted(updated);
        if (activeFilter !== 'trash') {
          const remaining = notes.filter((n) => n.id !== id && !n.isTrashed);
          setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
        }
      }
    }
  };

  const handleLockVault = () => {
    vaultKeyManager.lock();
  };

  const handlePurgeVault = async (purgeCloud = false) => {
    if (purgeCloud && isSupabaseConfigured()) {
      try {
        const result = await supabaseSync.purgeRemoteVault();
        if (!result.success) {
          alert(
            `Could not delete your notes from Supabase (${result.message || 'unknown error'}). ` +
              'Local data was NOT reset, so nothing is lost — fix the connection and try again.'
          );
          return;
        }
      } catch (err) {
        console.error('Failed to purge remote vault notes:', err);
        const msg = err instanceof Error ? err.message : String(err);
        alert(
          `Could not delete your notes from Supabase (${msg}). ` +
            'Local data was NOT reset, so nothing is lost — fix the connection and try again.'
        );
        return;
      }
    }
    await biometricService.disableBiometrics();
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
      await loadDecryptedNotes();
    }
  };

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;

  return (
    <div className="h-full flex flex-col bg-ctp-base text-ctp-text antialiased overflow-hidden font-sans">
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
          onNewNote={handleNewNote}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          isSaving={isSaving}
          syncStatus={syncStatus}
          isCloudConfigured={cloudConfigured}
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
