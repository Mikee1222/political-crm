-- Contact groups (ομάδες) — FK from contacts.group_id
create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#003476',
  year integer,
  description text,
  created_at timestamptz not null default now()
);

alter table public.contacts
  add column if not exists group_id uuid references public.contact_groups (id) on delete set null;

create index if not exists idx_contacts_group_id on public.contacts (group_id) where group_id is not null;

alter table public.contact_groups enable row level security;
drop policy if exists "authenticated contact_groups" on public.contact_groups;
create policy "authenticated contact_groups" on public.contact_groups
  for all to authenticated using (true) with check (true);
