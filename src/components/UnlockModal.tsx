import React, { useState } from 'react';
import { Lock, KeyRound, Clipboard, AlertCircle, ArrowRight, PlusCircle, Trash2, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { getPhraseValidationDetails, normalizePhrase } from '../crypto/mnemonic.js';
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
  const [showPhrase, setShowPhrase] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);
  const [vaultMismatch, setVaultMismatch] = useState(false);

  const {
    isValid: isPhraseValidBip39,
    wordCount,
    invalidWords,
    hasChecksumError,
    cleanPhrase,
  } = getPhraseValidationDetails(phraseInput);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const normalized = normalizePhrase(text);
        setPhraseInput(normalized);
        setErrorMessage(null);
        setVaultMismatch(false);
      }
    } catch {
      // Fallback if clipboard permission denied
    }
  };

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setVaultMismatch(false);

    if (!cleanPhrase) {
      setErrorMessage('Por favor, digite ou cole suas 12 palavras de recuperação.');
      return;
    }

    if (wordCount !== 12) {
      setErrorMessage(`A frase deve conter exatamente 12 palavras (atualmente: ${wordCount}/12).`);
      return;
    }

    if (invalidWords.length > 0) {
      setErrorMessage(
        `Palavra(s) não reconhecida(s) no dicionário BIP-39: "${invalidWords.join('", "')}". Clique em "Mostrar" para conferir a digitação.`
      );
      return;
    }

    if (hasChecksumError || !isPhraseValidBip39) {
      setErrorMessage(
        'As 12 palavras constam no dicionário BIP-39, mas o checksum não confere. Verifique a ordem das palavras ou se alguma palavra foi trocada.'
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
          // Check if local database actually has notes to protect
          const existingRecords = await storageAdapter.getAllEncrypted();
          if (existingRecords.length === 0) {
            // Local storage is empty (leftover token from previous test/session)
            // Re-initialize seamlessly with the valid user phrase!
            const token = createVerifierToken(verifierKey);
            await storageAdapter.initVault(token);
          } else {
            // There are local notes that belong to another vault
            vaultKeyManager.lock();
            setVaultMismatch(true);
            setErrorMessage(
              'Esta frase de 12 palavras é válida, mas pertence a outro cofre diferente do que está gravado localmente neste navegador.'
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
      setErrorMessage('Falha ao desbloquear cofre. Verifique se as palavras estão corretas.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleSwitchToThisVault = async () => {
    try {
      setIsUnlocking(true);
      setErrorMessage(null);
      // Erase local conflicting data and initialize with current valid phrase
      await storageAdapter.resetVault();
      const { verifierKey } = vaultKeyManager.unlock(cleanPhrase);
      const token = createVerifierToken(verifierKey);
      await storageAdapter.initVault(token);
      onUnlocked();
    } catch (err) {
      console.error('Failed to switch vault:', err);
      vaultKeyManager.lock();
      setErrorMessage('Erro ao redefinir e abrir o cofre.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handlePurgeVault = async () => {
    await storageAdapter.resetVault();
    vaultKeyManager.lock();
    setShowPurgeConfirm(false);
    setVaultMismatch(false);
    setPhraseInput('');
    setErrorMessage('Cofre local apagado com sucesso. Você pode criar um novo ou restaurar suas 12 palavras.');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative my-auto">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Desbloquear OwnNotes Vault</h2>
            <p className="text-sm text-slate-400">
              Digite ou cole sua frase de 12 palavras. As chaves residem exclusivamente em RAM.
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3.5 mb-5 space-y-2 text-rose-300 text-xs">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>

            {/* If there is a mismatch with previous local data, offer one-click adoption */}
            {vaultMismatch && (
              <div className="pt-2 border-t border-rose-500/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <span className="text-rose-200">Deseja substituir o cofre local e abrir este?</span>
                <button
                  type="button"
                  onClick={handleSwitchToThisVault}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold text-xs transition-colors shrink-0 shadow-sm"
                >
                  Substituir e Abrir
                </button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleUnlock}>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300">
                Frase de Recuperação (12 Palavras)
              </label>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowPhrase((prev) => !prev)}
                  className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  title={showPhrase ? 'Ocultar frase' : 'Mostrar frase'}
                >
                  {showPhrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showPhrase ? 'Ocultar' : 'Mostrar'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Clipboard className="w-3.5 h-3.5" />
                  <span>Colar da Área de Transferência</span>
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                rows={3}
                value={phraseInput}
                onChange={(e) => {
                  setPhraseInput(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                  if (vaultMismatch) setVaultMismatch(false);
                }}
                placeholder={
                  showPhrase
                    ? 'palavra1 palavra2 palavra3 palavra4 palavra5 palavra6 palavra7 palavra8 palavra9 palavra10 palavra11 palavra12'
                    : '•••••••• •••••••• •••••••• (12 palavras de recuperação)'
                }
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
                className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-100 text-sm font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none transition-all ${
                  !showPhrase ? 'masked-phrase' : ''
                }`}
                autoFocus
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1 mt-2 text-xs">
              <span className="text-slate-500">
                Palavras:{' '}
                <strong className={wordCount === 12 && isPhraseValidBip39 ? 'text-emerald-400' : 'text-slate-400'}>
                  {wordCount}/12
                </strong>
              </span>

              {wordCount > 0 && (
                <div>
                  {invalidWords.length > 0 ? (
                    <span className="text-rose-400 font-medium">
                      ⚠ {invalidWords.length} palavra(s) desconhecida(s)
                    </span>
                  ) : wordCount === 12 && isPhraseValidBip39 ? (
                    <span className="text-emerald-400 font-medium">✓ Frase BIP-39 válida</span>
                  ) : wordCount === 12 && hasChecksumError ? (
                    <span className="text-amber-400 font-medium">⚠ Checksum incorreto (verifique a ordem)</span>
                  ) : (
                    <span className="text-slate-500">Faltam {Math.max(0, 12 - wordCount)} palavra(s)</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="submit"
              disabled={isUnlocking}
              className="w-full flex items-center justify-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
            >
              {isUnlocking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Descriptografando Cofre...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Desbloquear Cofre</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
              <button
                type="button"
                onClick={onSwitchToCreate}
                className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Criar Novo Cofre</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPurgeConfirm(true)}
                className="flex items-center space-x-1 text-slate-500 hover:text-rose-400 transition-colors"
                title="Apagar dados criptografados locais deste dispositivo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar Dados Locais</span>
              </button>
            </div>
          </div>
        </form>

        {/* Purge Confirmation Modal */}
        {showPurgeConfirm && (
          <div className="absolute inset-0 bg-slate-950/95 rounded-2xl p-6 flex flex-col justify-center items-center text-center z-20">
            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Redefinir Cofre Local?</h3>
            <p className="text-xs text-slate-400 mb-5 max-w-xs">
              Isso apagará permanentemente as notas criptografadas armazenadas neste navegador. Suas notas no Supabase não serão afetadas caso você tenha a frase de 12 palavras.
            </p>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setShowPurgeConfirm(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePurgeVault}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/20"
              >
                Sim, Apagar Tudo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
