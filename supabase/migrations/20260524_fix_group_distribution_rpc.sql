-- Count group members via junction (many-to-many), not contacts.group_id alone.

create or replace function public.get_group_distribution()
returns table(group_name text, color text, count bigint)
language sql
security definer
set search_path = public
as $$
  select cg.name as group_name, cg.color, count(cgm.contact_id)::bigint as count
  from contact_groups cg
  left join contact_group_members cgm on cgm.group_id = cg.id
  group by cg.id, cg.name, cg.color
  order by count desc;
$$;

grant execute on function public.get_group_distribution() to authenticated;
