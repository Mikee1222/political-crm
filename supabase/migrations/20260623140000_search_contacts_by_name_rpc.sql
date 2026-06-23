-- Name-only contact search server-side (avoids full-table batch fetch).

create extension if not exists pg_trgm;

create index if not exists idx_contacts_first_name_trgm on contacts using gin (first_name gin_trgm_ops);
create index if not exists idx_contacts_last_name_trgm on contacts using gin (last_name gin_trgm_ops);

create or replace function public.search_contacts_by_name(
  p_first_name text default null,
  p_last_name text default null,
  p_father_name text default null
)
returns setof contacts
language sql
stable
as $$
  select * from contacts
  where
    (p_first_name is null or first_name ilike '%' || p_first_name || '%')
    and (p_last_name is null or last_name ilike '%' || p_last_name || '%')
    and (p_father_name is null or father_name ilike '%' || p_father_name || '%')
  order by created_at desc;
$$;

grant execute on function public.search_contacts_by_name(text, text, text) to authenticated, service_role;
