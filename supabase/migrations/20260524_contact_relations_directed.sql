-- Directed contact_relations (contact → related contact)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contact_relations'
      and column_name = 'contact_id_1'
  ) then
    create table if not exists public.contact_relations_directed (
      id uuid primary key default gen_random_uuid(),
      contact_id uuid not null references public.contacts(id) on delete cascade,
      related_contact_id uuid not null references public.contacts(id) on delete cascade,
      relation_type text,
      created_at timestamptz default now(),
      unique (contact_id, related_contact_id)
    );

    insert into public.contact_relations_directed (contact_id, related_contact_id, relation_type, created_at)
    select cr.contact_id_1, cr.contact_id_2, cr.relation_type, cr.created_at
    from public.contact_relations cr
    on conflict (contact_id, related_contact_id) do nothing;

    insert into public.contact_relations_directed (contact_id, related_contact_id, relation_type, created_at)
    select cr.contact_id_2, cr.contact_id_1, cr.relation_type, cr.created_at
    from public.contact_relations cr
    on conflict (contact_id, related_contact_id) do nothing;

    drop table public.contact_relations;
    alter table public.contact_relations_directed rename to contact_relations;
  elsif not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'contact_relations'
  ) then
    create table public.contact_relations (
      id uuid primary key default gen_random_uuid(),
      contact_id uuid not null references public.contacts(id) on delete cascade,
      related_contact_id uuid not null references public.contacts(id) on delete cascade,
      relation_type text,
      created_at timestamptz default now(),
      unique (contact_id, related_contact_id)
    );
  end if;
end $$;

create index if not exists idx_contact_relations_contact on public.contact_relations (contact_id);
create index if not exists idx_contact_relations_related on public.contact_relations (related_contact_id);

alter table public.contact_relations enable row level security;

drop policy if exists "contact rel all" on public.contact_relations;
drop policy if exists "authenticated_cr" on public.contact_relations;
create policy "authenticated_cr" on public.contact_relations
  for all to authenticated using (true) with check (true);
