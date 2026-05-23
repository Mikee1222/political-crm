-- Multi-person roles per request (requester, affected, helper, handler)
create table if not exists public.request_persons (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role text not null default 'requester'
    check (role in ('requester', 'affected', 'helper', 'handler')),
  created_at timestamptz default now(),
  unique (request_id, contact_id, role)
);

create index if not exists idx_request_persons_request on public.request_persons (request_id);
create index if not exists idx_request_persons_contact on public.request_persons (contact_id);

alter table public.request_persons enable row level security;

drop policy if exists "authenticated_rp" on public.request_persons;
create policy "authenticated_rp" on public.request_persons
  for all to authenticated using (true) with check (true);

-- Backfill from legacy single-contact columns
insert into public.request_persons (request_id, contact_id, role)
select r.id, r.contact_id, 'requester'
from public.requests r
where r.contact_id is not null
on conflict (request_id, contact_id, role) do nothing;

insert into public.request_persons (request_id, contact_id, role)
select r.id, r.affected_contact_id, 'affected'
from public.requests r
where r.affected_contact_id is not null
on conflict (request_id, contact_id, role) do nothing;
