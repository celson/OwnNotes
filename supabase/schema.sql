-- ============================================================================
-- OwnNotes - Zero-Knowledge Encrypted Vault Table
-- ============================================================================
-- The server stores ONLY ciphertext, 24-byte random nonces, timestamps, and
-- the pseudonymous vault_id. No plaintext titles, tags, or contents EVER
-- reach this database.
--
-- Access control: knowing a vault_id grants NO access by itself. Every
-- session must first authenticate (Supabase Anonymous Sign-In is enough --
-- no email/password required) and then call claim_vault(vault_id, proof)
-- with a secret derived from the user's own 12-word phrase. The first
-- caller to present a given vault_id's proof becomes its owner; every
-- later call (from any device) must present that same proof. Row Level
-- Security then restricts all reads and writes on ownnotes_records to
-- claimed owners only.
--
-- REQUIRED PROJECT SETTING: enable "Allow anonymous sign-ins" under
-- Authentication > Sign In / Providers in the Supabase dashboard, or
-- claim_vault will fail for every client.
--
-- Safe to re-run: this script drops the old fully-open policies from
-- earlier versions of OwnNotes before creating the locked-down ones below.
-- ============================================================================

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

-- Index for fast differential sync sweeps by vault
create index if not exists idx_ownnotes_records_vault_sync
  on public.ownnotes_records (vault_id, updated_at desc);

-- One row per vault_id, holding a bcrypt hash of its proof-of-ownership
-- secret. Never selectable directly by clients; only touched by the
-- claim_vault() function below.
create table if not exists public.vault_secrets (
  vault_id text primary key,
  proof_hash text not null,
  created_at timestamptz not null default now()
);

-- Which authenticated sessions (devices) have proven ownership of a
-- vault_id via claim_vault(). This is what ownnotes_records' RLS
-- policies check against.
create table if not exists public.vault_owners (
  vault_id text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (vault_id, owner_id)
);

alter table public.ownnotes_records enable row level security;
alter table public.vault_secrets enable row level security;
alter table public.vault_owners enable row level security;

-- No direct table grants: vault_secrets/vault_owners are only ever touched
-- by claim_vault(), which runs as the table owner (security definer) and
-- bypasses RLS internally.
revoke all on public.vault_secrets from anon, authenticated;
revoke all on public.vault_owners from anon, authenticated;

-- Drop any older, fully-open policies from prior versions of this schema.
drop policy if exists "OwnNotes anon select" on public.ownnotes_records;
drop policy if exists "OwnNotes anon insert" on public.ownnotes_records;
drop policy if exists "OwnNotes anon update" on public.ownnotes_records;
drop policy if exists "OwnNotes anon delete" on public.ownnotes_records;
drop policy if exists "OwnNotes owners select" on public.ownnotes_records;
drop policy if exists "OwnNotes owners insert" on public.ownnotes_records;
drop policy if exists "OwnNotes owners update" on public.ownnotes_records;
drop policy if exists "OwnNotes owners delete" on public.ownnotes_records;

-- Helper to check whether the current authenticated session owns the vault.
-- Runs as security definer so it can inspect vault_owners without granting
-- direct SELECT permissions on vault_owners to the authenticated role.
create or replace function public.is_vault_owner(p_vault_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.vault_owners
    where vault_id = p_vault_id and owner_id = auth.uid()
  );
$$;

revoke all on function public.is_vault_owner(text) from public, anon, authenticated;
grant execute on function public.is_vault_owner(text) to authenticated;

-- Only sessions that have successfully called claim_vault() for a given
-- vault_id may read or write that vault's rows. No policy targets the
-- `anon` role: an authenticated session (anonymous sign-in is sufficient)
-- is always required.
create policy "OwnNotes owners select"
  on public.ownnotes_records
  for select
  to authenticated
  using (public.is_vault_owner(vault_id));

create policy "OwnNotes owners insert"
  on public.ownnotes_records
  for insert
  to authenticated
  with check (public.is_vault_owner(vault_id));

create policy "OwnNotes owners update"
  on public.ownnotes_records
  for update
  to authenticated
  using (public.is_vault_owner(vault_id))
  with check (public.is_vault_owner(vault_id));

create policy "OwnNotes owners delete"
  on public.ownnotes_records
  for delete
  to authenticated
  using (public.is_vault_owner(vault_id));

-- Claims (or re-attaches this session to) a vault_id by proving knowledge
-- of its HKDF-derived proof secret. The first successful call for a
-- vault_id fixes its proof hash; every later call (from any device) must
-- match it, or it is rejected.
create or replace function public.claim_vault(p_vault_id text, p_proof text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select proof_hash into v_hash from public.vault_secrets where vault_id = p_vault_id;

  if v_hash is null then
    insert into public.vault_secrets (vault_id, proof_hash)
    values (p_vault_id, extensions.crypt(p_proof, extensions.gen_salt('bf')));
  elsif v_hash <> extensions.crypt(p_proof, v_hash) then
    raise exception 'invalid vault proof';
  end if;

  insert into public.vault_owners (vault_id, owner_id)
  values (p_vault_id, auth.uid())
  on conflict (vault_id, owner_id) do nothing;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon/authenticated by default
-- (ALTER DEFAULT PRIVILEGES at project creation); revoke from both roles
-- explicitly, not just from PUBLIC, then grant back only to authenticated.
revoke all on function public.claim_vault(text, text) from public, anon, authenticated;
grant execute on function public.claim_vault(text, text) to authenticated;

-- Enable Supabase Realtime for instant multi-device sync. Realtime still
-- evaluates the RLS policies above per subscribing connection, so a
-- session only ever receives change events for vault_ids it has claimed.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ownnotes_records'
  ) then
    alter publication supabase_realtime add table public.ownnotes_records;
  end if;
end $$;
