-- Geographic settings: counts from contacts only (not lookup tables)

create or replace function public.get_contact_municipality_counts()
returns table(name text, contact_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    trim(municipality) as name,
    count(*)::bigint as contact_count
  from public.contacts
  where municipality is not null
    and trim(municipality) <> ''
  group by trim(municipality)
  order by contact_count desc, name;
$$;

create or replace function public.get_contact_toponym_counts()
returns table(name text, contact_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    trim(toponym) as name,
    count(*)::bigint as contact_count
  from public.contacts
  where toponym is not null
    and trim(toponym) <> ''
    and length(trim(toponym)) > 2
  group by trim(toponym)
  order by contact_count desc, name;
$$;

create or replace function public.get_contact_electoral_district_counts()
returns table(name text, contact_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    trim(electoral_district) as name,
    count(*)::bigint as contact_count
  from public.contacts
  where electoral_district is not null
    and trim(electoral_district) <> ''
  group by trim(electoral_district)
  order by contact_count desc, name;
$$;

grant execute on function public.get_contact_municipality_counts() to authenticated;
grant execute on function public.get_contact_toponym_counts() to authenticated;
grant execute on function public.get_contact_electoral_district_counts() to authenticated;
