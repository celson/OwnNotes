import React, { useState } from 'react';
import { Key, Copy, Check, Download, AlertTriangle, ArrowRight } from 'lucide-react';
import { generatePhrase, isValidPhrase } from '../crypto/mnemonic.js';
import { createVerifierToken } from '../crypto/kdf.js';
import { vaultKeyManager } from '../services/vaultKeyManager.js';
import { storageAdapter } from '../services/storage/indexedDbAdapter.js';

interface OnboardingModalProps {
  onVaultCreated: () => void;
  onSwitchToUnlock: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onVaultCreated,
  onSwitchToUnlock,
}) => {
  const [phrase, setPhrase] = useState(() => generatePhrase());
  const [copied, setCopied] = useState(false);
  const [confirmedBackup, setConfirmedBackup] = useState(false);
  const [backupWarning, setBackupWarning] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const words = phrase.split(' ');

  const handleRegenerate = () => {
    setPhrase(generatePhrase());
    setCopied(false);
    setConfirmedBackup(false);
    setBackupWarning(null);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(phrase);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleDownloadBackup = () => {
    const content = `OwnNotes Vault Recovery Phrase
Date: ${new Date().toISOString()}

IMPORTANT: Keep this 12-word phrase secret and secure.
Without this phrase, your encrypted notes CANNOT be recovered.

Phrase:
${phrase}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ownnotes-recovery-phrase-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleInitializeVault = async () => {
    if (!confirmedBackup) {
      setBackupWarning('Please check the confirmation box below confirming you saved your 12-word recovery phrase.');
      return;
    }
    if (!isValidPhrase(phrase)) {
      setBackupWarning('Invalid recovery phrase. Please click "Generate New Words" to generate a fresh phrase.');
      return;
    }

    try {
      setIsInitializing(true);
      setBackupWarning(null);

      // Reset any old local vault data so the new vault starts completely fresh
      await storageAdapter.resetVault();

      // Derive keys in volatile memory
      const { verifierKey } = vaultKeyManager.unlock(phrase);

      // Generate the challenge verifier token to store in IndexedDB
      const verifierToken = createVerifierToken(verifierKey);
      await storageAdapter.initVault(verifierToken);

      onVaultCreated();
    } catch (err) {
      console.error('Failed to initialize vault:', err);
      setBackupWarning('Error initializing vault. Please try again.');
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative my-auto">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Create Your Encrypted Vault</h2>
            <p className="text-sm text-slate-400">
              Your 12-word recovery phrase is your sole identity and encryption key.
            </p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5 mb-6 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <strong className="text-amber-300 block mb-0.5">Zero-Persistence Policy:</strong>
            OwnNotes never stores this phrase on disk or server. If you lose these 12 words, your data is permanently lost. Write them down in a secure place.
          </div>
        </div>

        {/* 12 Word Grid */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 mb-5">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {words.map((word, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-lg text-sm select-all font-mono"
              >
                <span className="text-slate-500 text-xs w-4 select-none">{idx + 1}.</span>
                <span className="text-slate-200 font-medium">{word}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/80 text-xs">
            <button
              type="button"
              onClick={handleRegenerate}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              Generate New Words
            </button>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save File</span>
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Phrase'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Confirmation Checkbox */}
        <div className={`mb-5 p-3 rounded-xl border transition-colors ${
          backupWarning
            ? 'bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30'
            : 'bg-slate-950/40 border-slate-800/80'
        }`}>
          <label className="flex items-start space-x-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={confirmedBackup}
              onChange={(e) => {
                setConfirmedBackup(e.target.checked);
                if (backupWarning) setBackupWarning(null);
              }}
              className="mt-1 w-4 h-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900 cursor-pointer"
            />
            <span className="text-xs text-slate-300 group-hover:text-slate-200 leading-relaxed">
              I have safely recorded my 12-word phrase. I understand that OwnNotes does not store it and cannot restore my vault if lost.
            </span>
          </label>
        </div>

        {backupWarning && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-5 flex items-center space-x-2 text-xs text-amber-300 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{backupWarning}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSwitchToUnlock}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Already have a vault? Unlock here
          </button>

          <button
            type="button"
            disabled={isInitializing}
            onClick={handleInitializeVault}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <span>{isInitializing ? 'Encrypting...' : 'Open My Vault'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
