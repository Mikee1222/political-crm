-- Digit-normalized phone columns so contains-search works when stored values
-- have spaces, dashes, parentheses, or +30 prefixes (e.g. "6941 669788").

create extension if not exists pg_trgm;

alter table public.contacts
  add column if not exists phone_digits text
    generated always as (
      nullif(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), '')
    ) stored;

alter table public.contacts
  add column if not exists phone2_digits text
    generated always as (
      nullif(regexp_replace(coalesce(phone2, ''), '[^0-9]', '', 'g'), '')
    ) stored;

alter table public.contacts
  add column if not exists landline_digits text
    generated always as (
      nullif(regexp_replace(coalesce(landline, ''), '[^0-9]', '', 'g'), '')
    ) stored;

create index if not exists idx_contacts_phone_digits_trgm
  on public.contacts using gin (phone_digits gin_trgm_ops);

create index if not exists idx_contacts_phone2_digits_trgm
  on public.contacts using gin (phone2_digits gin_trgm_ops);

create index if not exists idx_contacts_landline_digits_trgm
  on public.contacts using gin (landline_digits gin_trgm_ops);
