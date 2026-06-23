-- Contact municipality/toponym counts for settings admin (avoids full-table JS scan)

create or replace function public.get_contact_municipality_counts()
returns table(name text, contact_count bigint)
language sql
security definer
set search_path = public
as $$
  with counts as (
    select trim(municipality) as name, count(*)::bigint as contact_count
    from public.contacts
    where municipality is not null and trim(municipality) <> ''
    group by trim(municipality)
  ),
  registered as (
    select trim(m.name) as name
    from public.municipalities m
    where m.name is not null and trim(m.name) <> ''
  ),
  all_names as (
    select name from counts
    union
    select name from registered
  )
  select an.name, coalesce(c.contact_count, 0)::bigint as contact_count
  from all_names an
  left join counts c on c.name = an.name
  order by an.name;
$$;

create or replace function public.get_contact_toponym_counts()
returns table(id uuid, name text, contact_count bigint)
language sql
security definer
set search_path = public
as $$
  with counts as (
    select trim(toponym) as name, count(*)::bigint as contact_count
    from public.contacts
    where toponym is not null and trim(toponym) <> ''
    group by trim(toponym)
  )
  select
    t.id,
    trim(t.name) as name,
    coalesce(c.contact_count, 0)::bigint as contact_count
  from public.toponyms t
  left join counts c on c.name = trim(t.name)
  where t.name is not null
    and trim(t.name) <> ''
    and length(trim(t.name)) > 2
  order by trim(t.name);
$$;

grant execute on function public.get_contact_municipality_counts() to authenticated;
grant execute on function public.get_contact_toponym_counts() to authenticated;
