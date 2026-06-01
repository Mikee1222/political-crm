-- Distinct request categories from requests.category (avoids PostgREST row cap on full scan)

create or replace function public.get_request_category_counts()
returns table(name text, request_count bigint)
language sql
security definer
set search_path = public
as $$
  select trim(category) as name, count(*)::bigint as request_count
  from public.requests
  where category is not null and trim(category) <> ''
  group by trim(category)
  order by count(*) desc;
$$;

grant execute on function public.get_request_category_counts() to authenticated;
