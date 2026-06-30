-- relation_type now stores Greek labels; drop legacy default.
alter table public.contact_relations
  alter column relation_type drop not null;

alter table public.contact_relations
  alter column relation_type drop default;
