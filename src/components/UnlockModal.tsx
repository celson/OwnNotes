import React, { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Clipboard as CapClipboard } from '@capacitor/clipboard';
import {
  Lock,
  KeyRound,
  Clipboard as ClipboardIcon,
  AlertCircle,
  ArrowRight,
  PlusCircle,
  Trash2,
  Eye,
  EyeOff,
  RefreshCw,
  LayoutGrid,
  AlignLeft,
  Fingerprint,
} from 'lucide-react';
import {
  getPhraseValidationDetails,
  extractWords,
  isBip39Word,
} from '../crypto/mnemonic.js';
import { checkVerifierToken, createVerifierToken } from '../crypto/kdf.js';
import { vaultKeyManager } from '../services/vaultKeyManager.js';
import { storageAdapter } from '../services/storage/indexedDbAdapter.js';
import { biometricService } from '../services/biometricService.js';

interface UnlockModalProps {
  onUnlocked: () => void;
  onSwitchToCreate: () => void;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  onUnlocked,
  onSwitchToCreate,
}) => {
  const [wordSlots, setWordSlots] = useState<string[]>(Array(12).fill(''));
  const [rawTextInput, setRawTextInput] = useState('');
  const [inputMode, setInputMode] = useState<'grid' | 'text'>('grid');
  const [showPhrase, setShowPhrase] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [vaultMismatch, setVaultMismatch] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Current phrase constructed from either grid or raw text
  const currentPhrase =
    inputMode === 'grid'
      ? wordSlots.map((w) => w.trim()).filter(Boolean).join(' ')
      : rawTextInput;

  const {
    isValid: isPhraseValidBip39,
    wordCount,
    words,
    invalidWords,
    hasChecksumError,
    cleanPhrase,
  } = getPhraseValidationDetails(currentPhrase);

  // Syncs extracted words into the 12 individual word slots
  const populateSlotsFromWords = (extracted: string[]) => {
    const newSlots = Array(12).fill('');
    for (let i = 0; i < Math.min(extracted.length, 12); i++) {
      newSlots[i] = extracted[i];
    }
    setWordSlots(newSlots);
    setRawTextInput(extracted.join(' '));
  };

  // Fast paste from clipboard handler: reads directly without any disruptive popups
  const handlePasteFullPhrase = async () => {
    setErrorMessage(null);
    let text = '';

    if (Capacitor.isNativePlatform()) {
      // In native Android APK: use Capacitor Clipboard plugin directly
      try {
        const capResult = await CapClipboard.read();
        if (capResult && capResult.value) {
          text = capResult.value;
        }
      } catch (err) {
        console.warn('Native clipboard read error:', err);
      }
    } else {
      // In web browser: use standard navigator.clipboard.readText directly on user click
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch (err) {
          console.warn('Browser clipboard read error:', err);
        }
      }
    }

    // Fallback: if native plugin returned empty on mobile, also try web clipboard
    if (!text && typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        // ignore
      }
    }

    // Process pasted text if found
    if (text && text.trim()) {
      const extracted = extractWords(text);
      if (extracted.length > 0) {
        populateSlotsFromWords(extracted);
        setErrorMessage(null);
        setVaultMismatch(false);
        return;
      } else {
        setErrorMessage('Clipboard does not contain any valid words.');
        return;
      }
    }

    // If reading failed (e.g. browser permission denied or clipboard empty)
    inputRefs.current[0]?.focus();
    setErrorMessage(
      'Clipboard is empty or browser permission was denied. You can paste directly into any field (Ctrl+V).'
    );
  };

  // Global paste handler on modal: allows pressing Ctrl+V anywhere to distribute 12 words
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (inputMode === 'text') return; // let textarea handle its own paste

      const pasted = e.clipboardData?.getData('text') || '';
      if (pasted && pasted.trim()) {
        const extracted = extractWords(pasted);
        if (extracted.length > 1) {
          e.preventDefault();
          populateSlotsFromWords(extracted);
          setErrorMessage(null);
          setVaultMismatch(false);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [inputMode]);

  // Direct paste on any individual slot distributes words across slots
  const handleSlotPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData?.getData('text') || '';
    if (!pasted) return;

    const extracted = extractWords(pasted);
    if (extracted.length > 1) {
      populateSlotsFromWords(extracted);
      setErrorMessage(null);
      setVaultMismatch(false);
    } else if (extracted.length === 1) {
      const newSlots = [...wordSlots];
      newSlots[index] = extracted[0];
      setWordSlots(newSlots);
      setRawTextInput(newSlots.filter(Boolean).join(' '));
      if (index < 11) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  // Handle change in a specific slot input
  const handleSlotChange = (index: number, value: string) => {
    setErrorMessage(null);
    setVaultMismatch(false);

    // If user pasted multiple words into a single slot
    const extracted = extractWords(value);
    if (extracted.length > 1) {
      const newSlots = [...wordSlots];
      for (let i = 0; i < extracted.length && index + i < 12; i++) {
        newSlots[index + i] = extracted[i];
      }
      setWordSlots(newSlots);
      setRawTextInput(newSlots.filter(Boolean).join(' '));
      const nextIndex = Math.min(index + extracted.length, 11);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    // Single word typing
    const cleanWord = value.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const newSlots = [...wordSlots];
    newSlots[index] = cleanWord;
    setWordSlots(newSlots);
    setRawTextInput(newSlots.filter(Boolean).join(' '));
  };

  // Handle key navigation (Space/Enter moves to next slot, Backspace moves back)
  const handleSlotKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (index < 11) {
        inputRefs.current[index + 1]?.focus();
      }
    } else if (e.key === 'Backspace' && !wordSlots[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle change in raw text area
  const handleRawTextChange = (value: string) => {
    setRawTextInput(value);
    setErrorMessage(null);
    setVaultMismatch(false);
    const extracted = extractWords(value);
    const newSlots = Array(12).fill('');
    for (let i = 0; i < Math.min(extracted.length, 12); i++) {
      newSlots[i] = extracted[i];
    }
    setWordSlots(newSlots);
  };

  const handleClear = () => {
    setWordSlots(Array(12).fill(''));
    setRawTextInput('');
    setErrorMessage(null);
    setVaultMismatch(false);
    inputRefs.current[0]?.focus();
  };

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setVaultMismatch(false);

    if (words.length === 0) {
      setErrorMessage('Please enter your 12-word recovery phrase.');
      return;
    }

    if (wordCount !== 12) {
      setErrorMessage(
        `The recovery phrase must contain exactly 12 words (currently detected: ${wordCount}/12).`
      );
      return;
    }

    if (invalidWords.length > 0) {
      setErrorMessage(
        `Unrecognized word(s) in BIP-39 dictionary: "${invalidWords.join('", "')}". Click the eye icon to verify spelling.`
      );
      return;
    }

    if (hasChecksumError || !isPhraseValidBip39) {
      setErrorMessage(
        'All 12 words exist in the BIP-39 dictionary, but the checksum is invalid. Check the word order or if any word was mistyped.'
      );
      return;
    }

    try {
      setIsUnlocking(true);
      // Derive keys in volatile memory
      const { verifierKey } = vaultKeyManager.unlock(cleanPhrase);

      // Check against stored vault challenge token
      const storedToken = await storageAdapter.getVerifierToken();

      if (storedToken) {
        const matches = checkVerifierToken(verifierKey, storedToken);
        if (!matches) {
          const existingRecords = await storageAdapter.getAllEncrypted();
          if (existingRecords.length === 0) {
            // Local vault has no notes (orphan token from previous test/session)
            // Re-initialize seamlessly with the valid phrase!
            const token = createVerifierToken(verifierKey);
            await storageAdapter.initVault(token);
          } else {
            // Local vault has notes from another phrase
            vaultKeyManager.lock();
            setVaultMismatch(true);
            setErrorMessage(
              'This 12-word recovery phrase is valid, but belongs to a different vault than the one stored in this browser.'
            );
            return;
          }
        }
      } else {
        // First-time restore or imported vault: register this verifier token
        const token = createVerifierToken(verifierKey);
        await storageAdapter.initVault(token);
      }

      onUnlocked();
    } catch (err) {
      console.error('Unlock failure:', err);
      vaultKeyManager.lock();
      setErrorMessage('Failed to unlock vault. Please verify your recovery phrase.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleSwitchToThisVault = async () => {
    try {
      setIsUnlocking(true);
      setErrorMessage(null);
      await storageAdapter.resetVault();
      const { verifierKey } = vaultKeyManager.unlock(cleanPhrase);
      const token = createVerifierToken(verifierKey);
      await storageAdapter.initVault(token);
      onUnlocked();
    } catch (err) {
      console.error('Failed to switch vault:', err);
      vaultKeyManager.lock();
      setErrorMessage('Error resetting and opening vault.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handlePurgeVault = async () => {
    await storageAdapter.resetVault();
    vaultKeyManager.lock();
    setShowPurgeConfirm(false);
    setVaultMismatch(false);
    handleClear();
    setErrorMessage('Local vault cleared successfully. You can create a new vault or restore your 12 words.');
  };

  // Check biometric availability and trigger prompt if enabled
  useEffect(() => {
    let active = true;
    void (async () => {
      const avail = await biometricService.isAvailable();
      const enabled = await biometricService.isEnabled();
      if (active) {
        setBiometricAvailable(avail.isAvailable);
        setBiometricEnabled(enabled);
        if (avail.isAvailable && enabled) {
          triggerBiometricUnlock();
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const triggerBiometricUnlock = async () => {
    try {
      setIsUnlocking(true);
      setErrorMessage(null);
      const res = await biometricService.unlockWithBiometrics();
      if (!res.success || !res.phrase) {
        if (res.error && !res.error.toLowerCase().includes('cancel')) {
          setErrorMessage(res.error);
        }
        return;
      }

      const { verifierKey } = vaultKeyManager.unlock(res.phrase);
      const storedToken = await storageAdapter.getVerifierToken();
      if (storedToken) {
        const matches = checkVerifierToken(verifierKey, storedToken);
        if (!matches) {
          vaultKeyManager.lock();
          setErrorMessage('A chave biométrica armazenada não corresponde ao cofre local.');
          return;
        }
      }

      onUnlocked();
    } catch (err: unknown) {
      console.error('Biometric unlock failure:', err);
      vaultKeyManager.lock();
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('cancel')) {
        setErrorMessage('Falha no desbloqueio por biometria.');
      }
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-7 shadow-2xl relative my-auto">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Unlock OwnNotes Vault</h2>
            <p className="text-xs text-slate-400">
              Enter or paste your 12-word recovery phrase. Keys reside exclusively in RAM.
            </p>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 mb-4 space-y-2 text-rose-300 text-xs">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>

            {vaultMismatch && (
              <div className="pt-2 border-t border-rose-500/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <span className="text-rose-200">Do you want to replace the local vault and open this one?</span>
                <button
                  type="button"
                  onClick={handleSwitchToThisVault}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-xs transition-colors shrink-0 shadow-sm cursor-pointer"
                >
                  Replace & Open
                </button>
              </div>
            )}
          </div>
        )}

        {/* Biometric Quick Unlock */}
        {biometricAvailable && biometricEnabled && (
          <div className="mb-5">
            <button
              type="button"
              onClick={triggerBiometricUnlock}
              disabled={isUnlocking}
              className="w-full py-3 px-4 rounded-xl font-medium bg-gradient-to-r from-emerald-600/90 to-teal-600/90 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/40 flex items-center justify-center space-x-2.5 transition-all active:scale-[0.98] border border-emerald-400/30 cursor-pointer"
            >
              <Fingerprint className="w-5 h-5 text-emerald-200" />
              <span className="font-semibold text-sm">Desbloquear com Impressão Digital</span>
            </button>

            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase tracking-wider font-semibold shrink-0">
                ou digite sua frase BIP-39
              </span>
            </div>
          </div>
        )}

        {/* Toolbar: Mode toggle, Paste, Show/Hide, Clear */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => setInputMode('grid')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                inputMode === 'grid'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="12 individual fields for each word"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>12 Fields</span>
            </button>
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                inputMode === 'text'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Freeform text area to type or paste"
            >
              <AlignLeft className="w-3.5 h-3.5" />
              <span>Freeform Text</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setShowPhrase((prev) => !prev)}
              className="flex items-center space-x-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={showPhrase ? 'Hide words' : 'Show words'}
            >
              {showPhrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPhrase ? 'Hide' : 'Show'}</span>
            </button>

            <button
              type="button"
              onClick={handlePasteFullPhrase}
              className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              title="Paste full phrase from clipboard"
            >
              <ClipboardIcon className="w-3.5 h-3.5" />
              <span>Paste All</span>
            </button>

            {(wordSlots.some(Boolean) || rawTextInput) && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Clear all fields"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleUnlock}>
          {/* Grid Mode: 12 Numbered Inputs */}
          {inputMode === 'grid' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
              {wordSlots.map((word, i) => {
                const hasText = Boolean(word);
                const isValid = hasText && isBip39Word(word);
                const isInvalid = hasText && !isValid;

                return (
                  <div
                    key={i}
                    className={`relative flex items-center bg-slate-950 border rounded-xl px-2.5 py-1.5 transition-all ${
                      isInvalid
                        ? 'border-rose-500/50 bg-rose-950/20'
                        : isValid
                        ? 'border-emerald-500/40 bg-emerald-950/10'
                        : 'border-slate-800 focus-within:border-indigo-500/60 focus-within:ring-1 focus-within:ring-indigo-500/30'
                    }`}
                  >
                    <span className="text-slate-600 text-xs font-mono w-4 shrink-0 select-none">
                      {i + 1}
                    </span>
                    <input
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      type={showPhrase ? 'text' : 'password'}
                      value={word}
                      onChange={(e) => handleSlotChange(i, e.target.value)}
                      onKeyDown={(e) => handleSlotKeyDown(i, e)}
                      onPaste={(e) => handleSlotPaste(i, e)}
                      placeholder={`word ${i + 1}`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="bg-transparent text-slate-100 text-xs font-mono w-full focus:outline-none placeholder:text-slate-700 selection:bg-indigo-500"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Textarea Mode: Single paste / edit box */}
          {inputMode === 'text' && (
            <div className="mb-4">
              <textarea
                rows={3}
                value={rawTextInput}
                onChange={(e) => handleRawTextChange(e.target.value)}
                placeholder="Paste or type your 12 words separated by spaces..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                style={
                  {
                    WebkitTextSecurity: showPhrase ? 'none' : 'disc',
                    textSecurity: showPhrase ? 'none' : 'disc',
                  } as React.CSSProperties
                }
                className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-xs font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none transition-all ${
                  !showPhrase ? 'masked-phrase' : ''
                }`}
                autoFocus
              />

              {/* Detected words preview */}
              {words.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 p-2 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  {words.map((w, i) => (
                    <span
                      key={i}
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md flex items-center space-x-1 ${
                        isBip39Word(w)
                          ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-950/40 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      <span className="text-slate-500 text-[10px]">{i + 1}.</span>
                      <span>{showPhrase ? w : '••••••'}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Counter and Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-1 mb-4 text-xs">
            <span className="text-slate-400">
              Words entered:{' '}
              <strong
                className={
                  wordCount === 12 && isPhraseValidBip39 ? 'text-emerald-400 font-bold' : 'text-slate-200'
                }
              >
                {wordCount}/12
              </strong>
            </span>

            <div>
              {wordCount === 0 ? (
                <span className="text-slate-500">Waiting for input or click &quot;Paste All&quot;</span>
              ) : invalidWords.length > 0 ? (
                <span className="text-rose-400 font-medium">
                  ⚠ {invalidWords.length} unrecognized word(s)
                </span>
              ) : wordCount === 12 && isPhraseValidBip39 ? (
                <span className="text-emerald-400 font-medium">✓ Valid BIP-39 phrase</span>
              ) : wordCount === 12 && hasChecksumError ? (
                <span className="text-amber-400 font-medium">⚠ Invalid checksum (check word order)</span>
              ) : (
                <span className="text-slate-500">{Math.max(0, 12 - wordCount)} word(s) remaining</span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={isUnlocking}
              className="w-full flex items-center justify-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-slate-950 text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
            >
              {isUnlocking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Decrypting Vault...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Unlock Vault</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
              <button
                type="button"
                onClick={onSwitchToCreate}
                className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create New Vault</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPurgeConfirm(true)}
                className="flex items-center space-x-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                title="Delete local encrypted data from this device"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Local Data</span>
              </button>
            </div>
          </div>
        </form>

        {/* Purge Confirmation Modal */}
        {showPurgeConfirm && (
          <div className="absolute inset-0 bg-slate-950/95 rounded-2xl p-6 flex flex-col justify-center items-center text-center z-20">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Reset Local Vault?</h3>
            <p className="text-xs text-slate-400 mb-5 max-w-xs">
              This will permanently delete all locally encrypted notes in this browser. Notes synced to Supabase will not be affected if you have your 12-word recovery phrase.
            </p>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeVault}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 cursor-pointer"
              >
                Yes, Delete Everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
