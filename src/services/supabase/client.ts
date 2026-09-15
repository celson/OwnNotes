/**
 * Supabase Client Factory.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './config.js';

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config) {
    cachedClient = null;
    return null;
  }

  if (cachedClient && lastUsedUrl === config.url && lastUsedKey === config.anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        // A real (anonymous) auth session is required: Supabase Row Level Security and
        // Realtime authorization are both evaluated against auth.uid(), not against
        // client-supplied filters. The session token itself carries no vault secret —
        // it only identifies this device to the `vault_owners` ownership check.
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'ownnotes-supabase-auth',
      },
    });
    lastUsedUrl = config.url;
    lastUsedKey = config.anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function resetSupabaseClient(): void {
  cachedClient = null;
  lastUsedUrl = '';
  lastUsedKey = '';
}

/**
 * Ensures the client holds an authenticated (anonymous) session.
 * Required before any read/write/realtime call: RLS policies on `ownnotes_records`
 * only grant access to `authenticated` sessions that have claimed the vault via
 * the `claim_vault` RPC (see supabase/schema.sql).
 */
export async function ensureAuthenticated(client: SupabaseClient): Promise<boolean> {
  const { data } = await client.auth.getSession();
  if (data.session) return true;

  const { error } = await client.auth.signInAnonymously();
  if (error) {
    console.error('Supabase anonymous sign-in failed:', error);
    return false;
  }
  return true;
}
