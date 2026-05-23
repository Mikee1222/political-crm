-- Contact addresses + electoral / flag columns.
-- NOTE: This migration may already have been applied manually in Supabase; safe to re-run (IF NOT EXISTS).

create table if not exists public.contact_addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  type text not null default 'Οικία',
  odos text,
  poli text,
  tk text,
  send_post boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_contact_addresses_contact on public.contact_addresses (contact_id);

alter table public.contact_addresses enable row level security;

drop policy if exists "authenticated_ca" on public.contact_addresses;
create policy "authenticated_ca" on public.contact_addresses
  for all to authenticated using (true) with check (true);

alter table public.contacts
  add column if not exists dimotologio text,
  add column if not exists may_not_have_mobile boolean default false,
  add column if not exists may_not_have_landline boolean default false,
  add column if not exists may_not_have_email boolean default false,
  add column if not exists is_dead boolean default false;
