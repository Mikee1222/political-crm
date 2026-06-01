-- Manual "marked as contacted" metadata on contacts (not campaign calls table).
alter table public.contacts
  add column if not exists last_contacted_by text;
