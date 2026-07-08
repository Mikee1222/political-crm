-- Default /api/requests ORDER BY created_at DESC was a parallel seq scan (~580ms on ~18k rows).
-- Status chip counts benefit from a status btree index.
create index if not exists idx_requests_created_at on public.requests (created_at desc);
create index if not exists idx_requests_status on public.requests (status);

-- Single-pass status counts for /api/requests module cache (avoids N head-count queries).
create or replace function public.get_request_status_counts()
returns table (status text, cnt bigint)
language sql
security definer
set search_path = public
stable
as $$
  select r.status::text, count(*)::bigint
  from public.requests r
  group by r.status;
$$;

grant execute on function public.get_request_status_counts() to authenticated, service_role;

analyze public.requests;
