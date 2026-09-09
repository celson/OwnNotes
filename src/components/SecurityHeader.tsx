import React from 'react';
import { Lock, ShieldCheck, Settings, RefreshCw } from 'lucide-react';

interface SecurityHeaderProps {
  onLock: () => void;
  onOpenSettings: () => void;
  autoLockMinutes: number;
}

export const SecurityHeader: React.FC<SecurityHeaderProps> = ({
  onLock,
  onOpenSettings,
  autoLockMinutes,
}) => {
  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between z-10 shrink-0">
      <div className="flex items-center space-x-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
          <Lock className="w-4 h-4" />
        </div>
        <div className="flex items-baseline space-x-2">
          <span className="font-bold text-lg tracking-tight text-white">OwnNotes</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3 h-3" />
            Zero-Knowledge Vault
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        <div className="hidden sm:flex items-center space-x-1 text-xs text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-md border border-slate-700/50">
          <RefreshCw className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span>RAM-only key • Auto-lock: {autoLockMinutes}m</span>
        </div>

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
          <span>Lock Vault</span>
        </button>
      </div>
    </header>
  );
};
