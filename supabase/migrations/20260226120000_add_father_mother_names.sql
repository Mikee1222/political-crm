-- Patronymic / metronymic (Greek official-style naming on contacts)
alter table public.contacts
  add column if not exists father_name text,
  add column if not exists mother_name text;
