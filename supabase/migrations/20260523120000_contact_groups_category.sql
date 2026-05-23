-- Contact group categories for searchable dropdown grouping
alter table public.contact_groups add column if not exists category text;

update public.contact_groups
set category = 'Εκλογές'
where name ilike '%ΕΚΛΟΓΕ%' or name ilike '%2023%' or name ilike '%ΨΗΦΙ%';

update public.contact_groups
set category = 'Ονομαστικές'
where name ilike '%ΟΝΟΜΑΣΤ%' or name ilike '%ΓΙΟΡΤ%' or name ilike '%ΕΟΡΤ%';

update public.contact_groups
set category = 'Πάσχα'
where name ilike '%ΠΑΣΧΑ%';

update public.contact_groups
set category = 'Χριστούγεννα'
where name ilike '%ΧΡΙΣΤΟΥΓΕΝ%';

update public.contact_groups
set category = 'Εκδηλώσεις'
where name ilike '%ΕΚΔΗΛ%' or name ilike '%ΟΜΙΛ%' or name ilike '%ΤΡΑΠΕΖ%';

update public.contact_groups
set category = 'Περιοδείες'
where name ilike '%ΠΕΡΙΟΔ%' or name ilike '%ΚΑΛΟΚΑΙΡ%';

update public.contact_groups
set category = 'Κατάσταση'
where name in (
  'ΘΕΤΙΚΟΣ',
  'ΑΡΝΗΤΙΚΟΣ',
  'ΑΠΕΒΙΩΣΕ',
  'ΟΧΙ ΕΠΙΚΟΙΝΩΝΙΑ',
  'ΜΗ ΕΓΚΥΡΟΣ ΑΡΙΘΜΟΣ',
  'ΧΩΡΙΣ ΑΡΙΘΜΟ'
);

update public.contact_groups
set category = 'Πρόσωπα'
where name ilike '%ΔΑ' or name ilike '%ΟΚ' or name ilike '%ΚΚ';

update public.contact_groups
set category = 'Άλλο'
where category is null;
