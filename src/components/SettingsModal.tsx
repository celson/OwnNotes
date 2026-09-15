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
  Cloud,
  Check,
  Copy,
  Code2,
} from 'lucide-react';
import { exportVaultBackup, importVaultBackup } from '../services/backup.js';
import {
  getSupabaseConfig,
  setSupabaseConfig,
  clearSupabaseConfig,
} from '../services/supabase/config.js';
import { supabaseSync } from '../services/supabase/syncService.js';
import { resetSupabaseClient } from '../services/supabase/client.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoLockMinutes: number;
  onChangeAutoLockMinutes: (mins: number) => void;
  onLockVault: () => void;
  onPurgeVault: (purgeCloud?: boolean) => void | Promise<void>;
  onReloadNotes: () => void;
  onSyncStatusChange?: () => void;
}

const SQL_SCHEMA = `-- Run this in your Supabase SQL Editor.
-- REQUIRED: also enable "Allow anonymous sign-ins" under
-- Authentication > Sign In / Providers, or sync will fail to authenticate.
create extension if not exists pgcrypto;

create table if not exists public.ownnotes_records (
  id uuid primary key,
  vault_id text not null,
  nonce text not null,
  ciphertext text not null,
  created_at bigint not null,
  updated_at bigint not null,
  is_deleted boolean not null default false
);

create index if not exists idx_ownnotes_records_vault_sync
  on public.ownnotes_records (vault_id, updated_at desc);

create table if not exists public.vault_secrets (
  vault_id text primary key,
  proof_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.vault_owners (
  vault_id text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vault_id, owner_id)
);

alter table public.ownnotes_records enable row level security;
alter table public.vault_secrets enable row level security;
alter table public.vault_owners enable row level security;

revoke all on public.vault_secrets from anon, authenticated;
revoke all on public.vault_owners from anon, authenticated;

drop policy if exists "OwnNotes anon select" on public.ownnotes_records;
drop policy if exists "OwnNotes anon insert" on public.ownnotes_records;
drop policy if exists "OwnNotes anon update" on public.ownnotes_records;
drop policy if exists "OwnNotes anon delete" on public.ownnotes_records;
drop policy if exists "OwnNotes owners select" on public.ownnotes_records;
drop policy if exists "OwnNotes owners insert" on public.ownnotes_records;
drop policy if exists "OwnNotes owners update" on public.ownnotes_records;
drop policy if exists "OwnNotes owners delete" on public.ownnotes_records;

create or replace function public.is_vault_owner(p_vault_id text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.vault_owners where vault_id = p_vault_id and owner_id = auth.uid());
$$;
revoke all on function public.is_vault_owner(text) from public, anon, authenticated;
grant execute on function public.is_vault_owner(text) to authenticated;

create policy "OwnNotes owners select"
  on public.ownnotes_records for select to authenticated
  using (public.is_vault_owner(vault_id));

create policy "OwnNotes owners insert"
  on public.ownnotes_records for insert to authenticated
  with check (public.is_vault_owner(vault_id));

create policy "OwnNotes owners update"
  on public.ownnotes_records for update to authenticated
  using (public.is_vault_owner(vault_id))
  with check (public.is_vault_owner(vault_id));

create policy "OwnNotes owners delete"
  on public.ownnotes_records for delete to authenticated
  using (public.is_vault_owner(vault_id));

create or replace function public.claim_vault(p_vault_id text, p_proof text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select proof_hash into v_hash from public.vault_secrets where vault_id = p_vault_id;
  if v_hash is null then
    insert into public.vault_secrets (vault_id, proof_hash) values (p_vault_id, extensions.crypt(p_proof, extensions.gen_salt('bf')));
  elsif v_hash <> extensions.crypt(p_proof, v_hash) then
    raise exception 'invalid vault proof';
  end if;
  insert into public.vault_owners (vault_id, owner_id) values (p_vault_id, auth.uid())
  on conflict (vault_id, owner_id) do nothing;
end;
$$;

revoke all on function public.claim_vault(text, text) from public, anon, authenticated;
grant execute on function public.claim_vault(text, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ownnotes_records'
  ) then
    alter publication supabase_realtime add table public.ownnotes_records;
  end if;
end $$;`;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  autoLockMinutes,
  onChangeAutoLockMinutes,
  onLockVault,
  onPurgeVault,
  onReloadNotes,
  onSyncStatusChange,
}) => {
  const [activeTab, setActiveTab] = useState<'security' | 'supabase'>('security');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purgeCloud, setPurgeCloud] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Supabase state
  const existingConfig = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(existingConfig?.url || '');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(existingConfig?.anonKey || '');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlSchema, setShowSqlSchema] = useState(false);

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
      alert(err instanceof Error ? err.message : 'Invalid or corrupted backup file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveAndTestSupabase = async () => {
    setTestResult(null);
    if (!supabaseUrl.trim() || !supabaseAnonKey.trim()) {
      setTestResult({ success: false, message: 'Please enter both Supabase URL and Anon Key.' });
      return;
    }

    try {
      setIsTesting(true);
      setSupabaseConfig(supabaseUrl, supabaseAnonKey);
      resetSupabaseClient();
      supabaseSync.resetClaim();

      const res = await supabaseSync.testConnection();
      setTestResult(res);

      if (res.success) {
        // Trigger initial sync
        await supabaseSync.syncAll(onReloadNotes);
        if (onSyncStatusChange) onSyncStatusChange();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ success: false, message: `Error: ${msg}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnectSupabase = () => {
    clearSupabaseConfig();
    resetSupabaseClient();
    supabaseSync.resetClaim();
    setSupabaseUrl('');
    setSupabaseAnonKey('');
    setTestResult({ success: true, message: 'Supabase cloud sync disconnected.' });
    if (onSyncStatusChange) onSyncStatusChange();
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SQL_SCHEMA);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div className="flex items-center space-x-2.5">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base text-white">Vault Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-3 mb-5">
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
              activeTab === 'security'
                ? 'bg-indigo-600 text-slate-950 font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Security & Local</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('supabase')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
              activeTab === 'supabase'
                ? 'bg-indigo-600 text-slate-950 font-bold'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Supabase Cloud Sync</span>
          </button>
        </div>

        {/* Tab: Security & Local */}
        {activeTab === 'security' && (
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
                  {getSupabaseConfig() && (
                    <label className="flex items-center space-x-2 text-rose-300 text-[11px] cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={purgeCloud}
                        onChange={(e) => setPurgeCloud(e.target.checked)}
                        className="rounded border-rose-500/50 bg-rose-950 text-rose-600 focus:ring-rose-500/30"
                      />
                      <span>Also permanently delete all notes from Supabase cloud vault</span>
                    </label>
                  )}
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmPurge(false);
                        setPurgeCloud(false);
                      }}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmPurge(false);
                        onPurgeVault(purgeCloud);
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
        )}

        {/* Tab: Supabase Cloud Sync */}
        {activeTab === 'supabase' && (
          <div className="space-y-4 text-xs text-slate-300">
            <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-3.5 text-slate-300 space-y-1">
              <strong className="text-indigo-300 block font-semibold">Zero-Knowledge Cloud Sync</strong>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Supabase receives only sealed ciphertext and 24-byte nonces. Your keys never leave this device.
                Any device holding your 12-word phrase automatically syncs to the exact same vault.
              </p>
            </div>

            <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-3.5 text-slate-300 space-y-1">
              <strong className="text-amber-300 block font-semibold">Required project setting</strong>
              <p className="text-slate-400 leading-relaxed text-[11px]">
                Enable <span className="font-mono">Allow anonymous sign-ins</span> under Authentication &gt; Sign In / Providers
                in your Supabase dashboard, then run the SQL setup script below. Access to your vault's rows is gated by
                proving knowledge of your 12-word phrase, not by the SQL schema alone.
              </p>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border flex items-start gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            <div>
              <label className="block text-slate-200 font-medium mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-200 font-medium mb-1">
                Supabase Public Anon Key
              </label>
              <input
                type="password"
                value={supabaseAnonKey}
                onChange={(e) => setSupabaseAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAndTestSupabase}
                  disabled={isTesting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-slate-950 font-bold rounded-lg shadow-sm transition-all"
                >
                  {isTesting ? 'Connecting...' : 'Save & Connect'}
                </button>

                {getSupabaseConfig() && (
                  <button
                    type="button"
                    onClick={handleDisconnectSupabase}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowSqlSchema(!showSqlSchema)}
                className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{showSqlSchema ? 'Hide SQL' : 'SQL Setup Script'}</span>
              </button>
            </div>

            {/* SQL Schema View */}
            {showSqlSchema && (
              <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono space-y-2">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Supabase SQL Table Schema:</span>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300"
                  >
                    {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSql ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>
                <pre className="overflow-x-auto text-slate-300 max-h-40 leading-relaxed">
                  {SQL_SCHEMA}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
