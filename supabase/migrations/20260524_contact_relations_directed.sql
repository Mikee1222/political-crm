-- Normalize contact_relations to the undirected pair schema.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'contact_relations'
      and column_name = 'contact_id'
  ) then
    create table if not exists public.contact_relations_pair (
      id uuid primary key default gen_random_uuid(),
      contact_id_1 uuid not null references public.contacts(id) on delete cascade,
      contact_id_2 uuid not null references public.contacts(id) on delete cascade,
      relation_type text,
      created_at timestamptz default now(),
      check (contact_id_1 < contact_id_2),
      unique (contact_id_1, contact_id_2)
    );

    insert into public.contact_relations_pair (contact_id_1, contact_id_2, relation_type, created_at)
    select
      case when cr.contact_id < cr.related_contact_id then cr.contact_id else cr.related_contact_id end,
      case when cr.contact_id < cr.related_contact_id then cr.related_contact_id else cr.contact_id end,
      cr.relation_type,
      cr.created_at
    from public.contact_relations cr
    where cr.contact_id is not null
      and cr.related_contact_id is not null
      and cr.contact_id <> cr.related_contact_id
    on conflict (contact_id_1, contact_id_2) do nothing;

    drop table public.contact_relations;
    alter table public.contact_relations_pair rename to contact_relations;
  elsif not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'contact_relations'
  ) then
    create table public.contact_relations (
      id uuid primary key default gen_random_uuid(),
      contact_id_1 uuid not null references public.contacts(id) on delete cascade,
      contact_id_2 uuid not null references public.contacts(id) on delete cascade,
      relation_type text,
      created_at timestamptz default now(),
      check (contact_id_1 < contact_id_2),
      unique (contact_id_1, contact_id_2)
    );
  end if;
end $$;

create index if not exists idx_contact_rel_pair on public.contact_relations (contact_id_1, contact_id_2);

alter table public.contact_relations enable row level security;

drop policy if exists "contact rel all" on public.contact_relations;
drop policy if exists "authenticated_cr" on public.contact_relations;
create policy "contact rel all" on public.contact_relations
  for all to authenticated using (true) with check (true);
