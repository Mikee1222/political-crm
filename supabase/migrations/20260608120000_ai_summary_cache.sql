alter table public.contacts
  add column if not exists ai_summary text,
  add column if not exists ai_summary_updated_at timestamptz;

alter table public.requests
  add column if not exists ai_summary text,
  add column if not exists ai_summary_updated_at timestamptz;
