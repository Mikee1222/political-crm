-- Communication log entries per contact (may already exist in hosted Supabase).

create table if not exists public.contact_call_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  contacted_at timestamptz not null default now(),
  marked_by_user_id uuid references auth.users (id) on delete set null,
  marked_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_call_logs_contact
  on public.contact_call_logs (contact_id, contacted_at desc);

alter table public.contact_call_logs enable row level security;
drop policy if exists "contact_call_logs all" on public.contact_call_logs;
create policy "contact_call_logs all" on public.contact_call_logs
  for all to authenticated using (true) with check (true);

alter table public.contact_call_logs
  add column if not exists marked_by_user_id uuid references auth.users (id);

alter table public.contact_call_logs
  add column if not exists marked_by_name text;
