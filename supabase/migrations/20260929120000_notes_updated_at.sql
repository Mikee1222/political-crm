-- Allow showing «Επεξεργάστηκε» on edited contact/request notes.
ALTER TABLE contact_notes ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE request_notes ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Include updated_at in contact summary recent_notes payload.
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
          'updated_at', n.updated_at,
          'author_name', n.author_name
        )
        order by n.created_at desc
      ),
      '[]'::jsonb
    ) as data
    from (
      select id, user_id, content, created_at, updated_at, author_name
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
