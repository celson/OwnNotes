import React, { useState, useRef } from 'react';
import {
  X,
  Shield,
  Clock,
  Download,
  Upload,
  Trash2,
  Lock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { exportVaultBackup, importVaultBackup } from '../services/backup.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoLockMinutes: number;
  onChangeAutoLockMinutes: (mins: number) => void;
  onLockVault: () => void;
  onPurgeVault: () => void;
  onReloadNotes: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  autoLockMinutes,
  onChangeAutoLockMinutes,
  onLockVault,
  onPurgeVault,
  onReloadNotes,
}) => {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await exportVaultBackup();
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export vault backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const res = await importVaultBackup(text);
      setImportStatus(`Successfully restored ${res.imported} encrypted notes.`);
      onReloadNotes();
      setTimeout(() => setImportStatus(null), 4000);
    } catch (err) {
      console.error('Import error:', err);
      alert('Invalid or corrupted backup file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative my-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center space-x-2.5">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base text-white">Vault Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-6 text-xs text-slate-300">
          {/* Section: Auto Lock */}
          <div>
            <h4 className="font-semibold text-slate-100 flex items-center gap-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Auto-Lock Inactivity Timer
            </h4>
            <p className="text-slate-400 mb-2 leading-relaxed">
              For security, the in-memory encryption key is wiped with zeroes after this duration of inactivity.
            </p>
            <div className="flex flex-wrap gap-2">
              {[1, 5, 15, 30, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => onChangeAutoLockMinutes(mins)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    autoLockMinutes === mins
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onLockVault();
              }}
              className="mt-3 flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs rounded-lg border border-rose-500/20 transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Lock Vault Now</span>
            </button>
          </div>

          {/* Section: Backup & Export */}
          <div>
            <h4 className="font-semibold text-slate-100 flex items-center gap-1.5 mb-2">
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              Encrypted Backup & Portability
            </h4>
            <p className="text-slate-400 mb-3 leading-relaxed">
              Export all sealed ciphertext records into a portable file. The exported file stays fully encrypted under your 12-word phrase.
            </p>

            {importStatus && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-2.5 rounded-lg mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>{importStatus}</span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg border border-slate-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExporting ? 'Exporting...' : 'Export Backup (.json)'}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg border border-slate-700 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Import Backup</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>

          {/* Section: Cryptography Details */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 text-[11px] space-y-1.5">
            <div className="font-semibold text-slate-200">Cryptographic Invariants:</div>
            <div className="text-slate-400">
              • <strong>Cipher:</strong> XChaCha20-Poly1305 with random 24-byte nonces.
            </div>
            <div className="text-slate-400">
              • <strong>Key Origin:</strong> 128-bit BIP-39 mnemonic via PBKDF2 & HKDF-SHA256.
            </div>
            <div className="text-slate-400">
              • <strong>Key Storage:</strong> 0 bytes on disk. Memory wiped on lock (`fill(0)`).
            </div>
          </div>

          {/* Section: Danger Zone */}
          <div className="pt-3 border-t border-slate-800">
            <h4 className="font-semibold text-rose-400 flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              Danger Zone
            </h4>

            {confirmPurge ? (
              <div className="bg-rose-950/30 border border-rose-500/30 p-3 rounded-xl space-y-2">
                <p className="text-rose-200">
                  Are you sure? This will delete all encrypted notes and reset your local vault.
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setConfirmPurge(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmPurge(false);
                      onPurgeVault();
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg shadow-sm"
                  >
                    Confirm Permanent Erase
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmPurge(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset Local Data on This Device</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
