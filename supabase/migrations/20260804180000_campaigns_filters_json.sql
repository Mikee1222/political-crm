-- Persist campaign contact-filter snapshot from «Νέα Καμπάνια» create modal.
alter table public.campaigns
  add column if not exists filters jsonb;

comment on column public.campaigns.filters is
  'Contact filter snapshot used when creating the campaign (JSON).';
