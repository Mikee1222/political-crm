-- Per-user recently viewed contacts and requests (dashboard widgets).

create table if not exists public.contact_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, contact_id)
);

create index if not exists idx_contact_views_user_viewed
  on public.contact_views (user_id, viewed_at desc);

create table if not exists public.request_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists idx_request_views_user_viewed
  on public.request_views (user_id, viewed_at desc);

alter table public.contact_views enable row level security;
alter table public.request_views enable row level security;

drop policy if exists "contact_views_own" on public.contact_views;
create policy "contact_views_own" on public.contact_views
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "request_views_own" on public.request_views;
create policy "request_views_own" on public.request_views
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
