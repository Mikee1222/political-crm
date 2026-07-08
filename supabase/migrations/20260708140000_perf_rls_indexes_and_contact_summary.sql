-- Performance: RLS policy optimization, duplicate index cleanup, and summary RPC.

-- Cache the CRM role check as a stable SECURITY DEFINER function so policy checks
-- can avoid repeating the same correlated lookup logic.
create or replace function public.is_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_portal, false) = false
  );
$$;

grant execute on function public.is_crm_user() to authenticated;

-- CONTACTS RLS: remove overlapping permissive SELECT policies and keep
-- operation-specific policies with shared checks.
drop policy if exists "contacts_crm" on public.contacts;
drop policy if exists "contacts_portal_read" on public.contacts;

create policy "contacts_read" on public.contacts
for select
to authenticated
using (
  public.is_crm_user()
  or exists (
    select 1
    from public.portal_users pu
    where pu.auth_user_id = (select auth.uid())
      and pu.contact_id = contacts.id
  )
);

create policy "contacts_insert" on public.contacts
for insert
to authenticated
with check (public.is_crm_user());

create policy "contacts_update" on public.contacts
for update
to authenticated
using (public.is_crm_user())
with check (public.is_crm_user());

create policy "contacts_delete" on public.contacts
for delete
to authenticated
using (public.is_crm_user());

-- REQUESTS RLS: same approach, keep portal read/insert semantics with
-- explicit references and auth.uid() initplan style.
drop policy if exists "requests_crm" on public.requests;
drop policy if exists "requests_portal_read" on public.requests;
drop policy if exists "requests_portal_ins" on public.requests;

create policy "requests_read" on public.requests
for select
to authenticated
using (
  public.is_crm_user()
  or (
    coalesce(portal_visible, true) = true
    and exists (
      select 1
      from public.portal_users pu
      where pu.auth_user_id = (select auth.uid())
        and pu.contact_id = requests.contact_id
    )
  )
);

create policy "requests_insert" on public.requests
for insert
to authenticated
with check (
  public.is_crm_user()
  or exists (
    select 1
    from public.portal_users pu
    where pu.auth_user_id = (select auth.uid())
      and pu.contact_id = requests.contact_id
  )
);

create policy "requests_update" on public.requests
for update
to authenticated
using (public.is_crm_user())
with check (public.is_crm_user());

create policy "requests_delete" on public.requests
for delete
to authenticated
using (public.is_crm_user());

-- PRIORITY 2: remove duplicate contact_group_members(group_id) index.
drop index if exists public.idx_contact_group_members_group_id;

-- PRIORITY 5: add missing indexes only when no equivalent leading-column index exists.
create index if not exists idx_requests_contact_id on public.requests (contact_id);
create index if not exists idx_contacts_last_name_first_name on public.contacts (last_name, first_name);

do $$
begin
  if not exists (
    select 1
    from pg_indexes i
    where i.schemaname = 'public'
      and i.tablename = 'calls'
      and i.indexdef like '%USING btree (contact_id%'
  ) then
    execute 'create index idx_calls_contact_id on public.calls (contact_id)';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes i
    where i.schemaname = 'public'
      and i.tablename = 'contact_notes'
      and i.indexdef like '%USING btree (contact_id%'
  ) then
    execute 'create index idx_contact_notes_contact_id on public.contact_notes (contact_id)';
  end if;
end $$;

-- PRIORITY 3 support: one-roundtrip summary payload for contact first paint.
create or replace function public.get_contact_summary(p_contact_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with target_contact as (
    select c.*
    from public.contacts c
    where c.id = p_contact_id
  ),
  groups as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cg.id,
          'name', cg.name,
          'color', cg.color,
          'description', cg.description,
          'year', cg.year
        )
        order by cg.name asc
      ),
      '[]'::jsonb
    ) as data
    from public.contact_group_members cgm
    join public.contact_groups cg on cg.id = cgm.group_id
    where cgm.contact_id = p_contact_id
  ),
  recent_notes as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'user_id', n.user_id,
          'content', n.content,
          'created_at', n.created_at,
          'author_name', n.author_name
        )
        order by n.created_at desc
      ),
      '[]'::jsonb
    ) as data
    from (
      select id, user_id, content, created_at, author_name
      from public.contact_notes
      where contact_id = p_contact_id
      order by created_at desc
      limit 5
    ) n
  ),
  open_requests as (
    select count(*)::int as total
    from public.requests r
    where r.contact_id = p_contact_id
      and r.status in ('Ανοικτό', 'Νέο', 'Σε εξέλιξη')
  ),
  related_people as (
    select count(*)::int as total
    from public.contact_relations cr
    where cr.contact_id_1 = p_contact_id
       or cr.contact_id_2 = p_contact_id
  )
  select jsonb_build_object(
    'contact', to_jsonb(tc),
    'groups', (select g.data from groups g),
    'recent_notes', (select rn.data from recent_notes rn),
    'open_requests_count', (select o.total from open_requests o),
    'related_persons_count', (select rp.total from related_people rp)
  )
  from target_contact tc;
$$;

grant execute on function public.get_contact_summary(uuid) to authenticated;
