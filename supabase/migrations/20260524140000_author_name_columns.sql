-- Denormalized author display names (migrated from Lighthouse addedby / user maps)
alter table public.contacts
  add column if not exists author_name text;

alter table public.contact_notes
  add column if not exists author_name text;

alter table public.request_notes
  add column if not exists author_name text;
