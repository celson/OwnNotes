/**
 * Supabase configuration manager.
 * Stores project URL and public Anon Key.
 */

const STORAGE_KEY_URL = 'ownnotes_supabase_url';
const STORAGE_KEY_ANON = 'ownnotes_supabase_anon_key';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  if (typeof window === 'undefined') return null;

  const url =
    localStorage.getItem(STORAGE_KEY_URL) ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    '';
  const anonKey =
    localStorage.getItem(STORAGE_KEY_ANON) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    '';

  if (url.trim() && anonKey.trim()) {
    return { url: url.trim(), anonKey: anonKey.trim() };
  }
  return null;
}

export function setSupabaseConfig(url: string, anonKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
  localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
}

export function clearSupabaseConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON);
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
