import React, { useState } from 'react';
import { Lock, KeyRound, Clipboard, AlertCircle, ArrowRight, PlusCircle, Trash2 } from 'lucide-react';
import { isValidPhrase } from '../crypto/mnemonic.js';
import { checkVerifierToken, createVerifierToken } from '../crypto/kdf.js';
import { vaultKeyManager } from '../services/vaultKeyManager.js';
import { storageAdapter } from '../services/storage/indexedDbAdapter.js';

interface UnlockModalProps {
  onUnlocked: () => void;
  onSwitchToCreate: () => void;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  onUnlocked,
  onSwitchToCreate,
}) => {
  const [phraseInput, setPhraseInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  const cleanPhrase = phraseInput.trim().toLowerCase().replace(/\s+/g, ' ');
  const wordCount = cleanPhrase ? cleanPhrase.split(' ').length : 0;
  const isPhraseValidBip39 = isValidPhrase(cleanPhrase);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPhraseInput(text.trim());
        setErrorMessage(null);
      }
    } catch {
      // Fallback if clipboard permission denied
    }
  };

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (wordCount !== 12) {
      setErrorMessage('The recovery phrase must consist of exactly 12 words.');
      return;
    }

    if (!isPhraseValidBip39) {
      setErrorMessage('Invalid phrase or checksum error. Please verify the words.');
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
          // Immediately wipe memory
          vaultKeyManager.lock();
          setErrorMessage('The entered phrase does not match the vault stored on this device.');
          return;
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
      setErrorMessage('Failed to unlock vault. Please check your phrase.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handlePurgeVault = async () => {
    await storageAdapter.resetVault();
    vaultKeyManager.lock();
    setShowPurgeConfirm(false);
    setPhraseInput('');
    setErrorMessage('Local vault wiped successfully.');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative my-auto">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Unlock OwnNotes Vault</h2>
            <p className="text-sm text-slate-400">
              Enter your 12-word phrase. Keys exist strictly in volatile RAM.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 mb-5 flex items-start space-x-3 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleUnlock}>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                12-Word Recovery Phrase
              </label>
              <button
                type="button"
                onClick={handlePaste}
                className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>Paste from Clipboard</span>
              </button>
            </div>

            <textarea
              rows={3}
              value={phraseInput}
              onChange={(e) => {
                setPhraseInput(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none transition-all"
              autoFocus
            />

            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-slate-500">
                Words: <strong className={wordCount === 12 ? 'text-emerald-400' : 'text-slate-400'}>{wordCount}/12</strong>
              </span>
              {wordCount === 12 && (
                <span className={isPhraseValidBip39 ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
                  {isPhraseValidBip39 ? '✓ Valid BIP-39 checksum' : '⚠ Invalid phrase checksum'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={wordCount !== 12 || !isPhraseValidBip39 || isUnlocking}
              className="w-full flex items-center justify-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isUnlocking ? 'Decrypting Vault...' : 'Unlock Vault'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
              <button
                type="button"
                onClick={onSwitchToCreate}
                className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Create New Vault</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPurgeConfirm(true)}
                className="flex items-center space-x-1 text-slate-500 hover:text-rose-400 transition-colors"
                title="Erase encrypted local data on this device"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset Local Data</span>
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
              This will permanently delete all encrypted notes stored on this device. If you don't have a backup or phrase, your notes cannot be restored.
            </p>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeVault}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20"
              >
                Yes, Erase Everything
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
