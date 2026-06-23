-- Resolve contact IDs for group filters server-side (avoids PostgREST URL length limits).

create or replace function public.get_contacts_in_groups(
  group_ids uuid[],
  match_mode text default 'or'
)
returns table(contact_id uuid)
language sql
security definer
set search_path = public
as $$
  with membership as (
    select cgm.contact_id, cgm.group_id
    from contact_group_members cgm
    where cgm.group_id = any (group_ids)
    union
    select c.id as contact_id, c.group_id
    from contacts c
    where c.group_id = any (group_ids)
  ),
  grouped as (
    select
      membership.contact_id,
      count(distinct membership.group_id) as group_hits
    from membership
    group by membership.contact_id
  ),
  need as (
    select coalesce(array_length(group_ids, 1), 0) as n
  )
  select grouped.contact_id
  from grouped, need
  where need.n > 0
    and (
      (coalesce(lower(trim(match_mode)), 'or') = 'and' and grouped.group_hits = need.n)
      or (coalesce(lower(trim(match_mode)), 'or') <> 'and' and grouped.group_hits >= 1)
    );
$$;

grant execute on function public.get_contacts_in_groups(uuid[], text) to authenticated;
