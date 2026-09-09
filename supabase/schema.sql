-- ============================================================================
-- OwnNotes - Zero-Knowledge Encrypted Vault Table
-- ============================================================================
-- The server stores ONLY ciphertext, 24-byte random nonces, timestamps, and
-- the pseudonymous vault_id.
-- No plaintext titles, tags, or contents EVER reach this database.
-- ============================================================================

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

-- Enable Row Level Security
alter table public.ownnotes_records enable row level security;

-- Drop existing policies if any
drop policy if exists "OwnNotes anon select" on public.ownnotes_records;
drop policy if exists "OwnNotes anon insert" on public.ownnotes_records;
drop policy if exists "OwnNotes anon update" on public.ownnotes_records;
drop policy if exists "OwnNotes anon delete" on public.ownnotes_records;

-- Public anon policies: records are already encrypted with user's client-side key
create policy "OwnNotes anon select"
  on public.ownnotes_records
  for select
  to anon, authenticated
  using (true);

create policy "OwnNotes anon insert"
  on public.ownnotes_records
  for insert
  to anon, authenticated
  with check (true);

create policy "OwnNotes anon update"
  on public.ownnotes_records
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "OwnNotes anon delete"
  on public.ownnotes_records
  for delete
  to anon, authenticated
  using (true);

-- Enable Supabase Realtime for instant multi-device sync
alter publication supabase_realtime add table public.ownnotes_records;
