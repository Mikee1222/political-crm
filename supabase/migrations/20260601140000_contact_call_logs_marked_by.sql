-- Manual communication markers on `calls` (table already exists in hosted Supabase).

alter table public.calls
  add column if not exists marked_by_user_id uuid references auth.users (id) on delete set null;

alter table public.calls
  add column if not exists marked_by_name text;

create index if not exists idx_calls_contact_called_at
  on public.calls (contact_id, called_at desc nulls last);
