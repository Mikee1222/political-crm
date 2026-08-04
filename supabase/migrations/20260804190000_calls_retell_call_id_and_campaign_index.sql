-- Link Pending campaign calls to Retell call_id; speed campaign call lookups.
alter table public.calls
  add column if not exists retell_call_id text;

create index if not exists idx_calls_retell_call_id
  on public.calls (retell_call_id)
  where retell_call_id is not null;

create index if not exists idx_calls_campaign_id
  on public.calls (campaign_id);
