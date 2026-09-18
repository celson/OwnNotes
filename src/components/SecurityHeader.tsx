import React from 'react';
import { Lock, ShieldCheck, Settings, RefreshCw, Cloud, CloudOff, CloudCheck, AlertTriangle } from 'lucide-react';
import type { SyncStatus } from '../services/supabase/syncService.js';

interface SecurityHeaderProps {
  onLock: () => void;
  onOpenSettings: () => void;
  autoLockMinutes: number;
  syncStatus: SyncStatus;
  onManualSync: () => void;
  isCloudConfigured: boolean;
}

export const SecurityHeader: React.FC<SecurityHeaderProps> = ({
  onLock,
  onOpenSettings,
  autoLockMinutes,
  syncStatus,
  onManualSync,
  isCloudConfigured,
}) => {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between z-10 shrink-0">
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shrink-0">
          <Lock className="w-4 h-4" />
        </div>
        <div className="flex items-center space-x-2 min-w-0">
          <span className="font-bold text-lg tracking-tight text-white shrink-0">OwnNotes</span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-medium whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Zero-Knowledge Vault</span>
            <span className="sm:hidden text-[10px]">Zero-Knowledge</span>
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Memory status */}
        <div className="hidden md:flex items-center space-x-1 text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-md border border-slate-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>RAM-only • Auto-lock: {autoLockMinutes}m</span>
        </div>

        {/* Cloud Sync Status */}
        {isCloudConfigured ? (
          <button
            onClick={onManualSync}
            disabled={syncStatus === 'syncing'}
            title="Click to trigger Supabase Cloud Sync"
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors bg-slate-800/80 border-slate-700 hover:border-slate-600 active:scale-95"
          >
            {syncStatus === 'syncing' && (
              <>
                <RefreshCw className="w-3 h-3 text-indigo-400 animate-spin" />
                <span className="text-indigo-300 hidden sm:inline">Syncing...</span>
              </>
            )}
            {syncStatus === 'synced' && (
              <>
                <CloudCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300 hidden sm:inline">Synced</span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-rose-300 hidden sm:inline">Sync Error</span>
              </>
            )}
            {syncStatus === 'idle' && (
              <>
                <Cloud className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-300 hidden sm:inline">Cloud Sync</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={onOpenSettings}
            title="Set up Supabase to sync encrypted notes across devices"
            className="flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] text-slate-400 bg-slate-800/40 border border-slate-700/40 hover:text-slate-200 transition-colors"
          >
            <CloudOff className="w-3 h-3 text-slate-500" />
            <span className="hidden sm:inline">Local Only</span>
          </button>
        )}

        <button
          onClick={onOpenSettings}
          title="Vault Settings"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={onLock}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-semibold rounded-lg border border-rose-500/30 transition-all shadow-sm active:scale-95"
          title="Lock vault immediately and wipe key from memory"
        >
          <Lock className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Lock Vault</span>
        </button>
      </div>
    </header>
  );
};
