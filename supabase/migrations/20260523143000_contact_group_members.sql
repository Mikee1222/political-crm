-- Junction table: contacts ↔ contact_groups (many-to-many)
create table if not exists public.contact_group_members (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  group_id uuid not null references public.contact_groups (id) on delete cascade,
  unique (contact_id, group_id)
);

create index if not exists idx_contact_group_members_contact_id
  on public.contact_group_members (contact_id);

create index if not exists idx_contact_group_members_group_id
  on public.contact_group_members (group_id);

alter table public.contact_group_members enable row level security;

drop policy if exists "authenticated contact_group_members" on public.contact_group_members;
create policy "authenticated contact_group_members" on public.contact_group_members
  for all to authenticated using (true) with check (true);
