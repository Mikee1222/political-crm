create extension if not exists "pgcrypto";

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  phone text not null unique,
  email text,
  address text,
  area text,
  age integer,
  gender text,
  occupation text,
  source text,
  tags text[],
  priority text,
  political_stance text,
  influence boolean,
  call_status text,
  notes text,
  last_contacted_at timestamp,
  created_at timestamp default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  started_at timestamp,
  created_at timestamp default now()
);

-- Campaign metadata (safe to run on existing DBs)
alter table public.campaigns
  add column if not exists description text,
  add column if not exists status text not null default 'active';

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  called_at timestamp,
  duration_seconds integer,
  outcome text,
  transferred_to_politician boolean,
  notes text
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  title text not null,
  due_date date,
  completed boolean default false,
  created_at timestamp default now()
);

alter table public.tasks
  add column if not exists description text,
  add column if not exists priority text default 'Medium',
  add column if not exists category text,
  add column if not exists completed_at timestamptz;

alter table public.contacts
  add column if not exists nickname text,
  add column if not exists spouse_name text,
  add column if not exists name_day date,
  add column if not exists birthday date,
  add column if not exists municipality text,
  add column if not exists electoral_district text,
  add column if not exists toponym text;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  title text not null,
  description text,
  category text,
  status text default 'Νέο',
  assigned_to text,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

create table if not exists public.name_days (
  id uuid primary key default gen_random_uuid(),
  month integer not null,
  day integer not null,
  names text[] not null default '{}'
);

alter table public.contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.calls enable row level security;
alter table public.tasks enable row level security;
alter table public.requests enable row level security;
alter table public.name_days enable row level security;

drop policy if exists "authenticated contacts" on public.contacts;
drop policy if exists "authenticated campaigns" on public.campaigns;
drop policy if exists "authenticated calls" on public.calls;
drop policy if exists "authenticated tasks" on public.tasks;
drop policy if exists "authenticated requests" on public.requests;
drop policy if exists "authenticated name_days" on public.name_days;

create policy "authenticated contacts" on public.contacts for all to authenticated using (true) with check (true);
create policy "authenticated campaigns" on public.campaigns for all to authenticated using (true) with check (true);
create policy "authenticated calls" on public.calls for all to authenticated using (true) with check (true);
create policy "authenticated tasks" on public.tasks for all to authenticated using (true) with check (true);
create policy "authenticated requests" on public.requests for all to authenticated using (true) with check (true);
create policy "authenticated name_days" on public.name_days for all to authenticated using (true) with check (true);

-- Πλήρες εορτολόγιο: εισαγωγή από POST /api/admin/nameday-sync (src/lib/nameday-seed.ts, δεδομένα alexstyl + συμπληρώσεις)
create unique index if not exists name_days_month_day_uniq on public.name_days (month, day);

-- Profiles (roles) + Google Calendar tokens
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'caller' check (role in ('caller', 'manager', 'admin')),
  created_at timestamp with time zone default now()
);

create table if not exists public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  expiry timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Legacy DBs: add expiry (mirror of expires_at for OAuth expiry)
alter table public.google_tokens
  add column if not exists expiry timestamp with time zone;
update public.google_tokens
  set expiry = coalesce(expiry, expires_at)
  where expiry is null and expires_at is not null;

create index if not exists idx_profiles_role on public.profiles (role);

alter table public.profiles enable row level security;
alter table public.google_tokens enable row level security;

drop policy if exists "profiles read own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles read own" on public.profiles for select using (auth.uid() = id);
create policy "profiles update own" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));

drop policy if exists "google tokens own" on public.google_tokens;
create policy "google tokens own" on public.google_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Portal signups: no row here; /api/portal/auth/register sets profiles.is_portal via service role.
  if coalesce(new.raw_app_meta_data->>'portal_signup', 'false') = 'true' then
    return new;
  end if;
  if coalesce(new.raw_user_meta_data->>'portal_signup', 'false') = 'true' then
    return new;
  end if;
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'caller'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Υπάρχοντες χρήστες χωρίς profile
insert into public.profiles (id, full_name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'caller'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- Data tools: shared phone (not unique), optional empty phone
alter table public.contacts drop constraint if exists contacts_phone_key;
alter table public.contacts alter column phone drop not null;

create table if not exists public.dismissed_duplicates (
  id uuid primary key default gen_random_uuid(),
  contact_id_1 uuid not null references public.contacts(id) on delete cascade,
  contact_id_2 uuid not null references public.contacts(id) on delete cascade,
  dismissed_at timestamptz default now(),
  check (contact_id_1 < contact_id_2),
  unique (contact_id_1, contact_id_2)
);

create table if not exists public.contact_relations (
  id uuid primary key default gen_random_uuid(),
  contact_id_1 uuid not null references public.contacts(id) on delete cascade,
  contact_id_2 uuid not null references public.contacts(id) on delete cascade,
  relation_type text not null default 'family',
  created_at timestamptz default now(),
  check (contact_id_1 < contact_id_2),
  unique (contact_id_1, contact_id_2)
);

create index if not exists idx_dismissed_pair on public.dismissed_duplicates (contact_id_1, contact_id_2);
create index if not exists idx_contact_rel_pair on public.contact_relations (contact_id_1, contact_id_2);

alter table public.dismissed_duplicates enable row level security;
alter table public.contact_relations enable row level security;

drop policy if exists "dismissed dup all" on public.dismissed_duplicates;
drop policy if exists "contact rel all" on public.contact_relations;
create policy "dismissed dup all" on public.dismissed_duplicates for all to authenticated using (true) with check (true);
create policy "contact rel all" on public.contact_relations for all to authenticated using (true) with check (true);

-- AI Βοηθός: συνομιλίες (Αλεξάνδρα)
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  action jsonb,
  context_label text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user on public.ai_conversations (user_id, updated_at desc);
create index if not exists idx_ai_messages_conversation on public.ai_messages (conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_conversations own" on public.ai_conversations;
create policy "ai_conversations own" on public.ai_conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ai_messages through conversation" on public.ai_messages;
create policy "ai_messages through conversation" on public.ai_messages for all to authenticated
  using (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

-- Υπενθυμίσεις χωρίς συγκεκριμένη επαφή (Alexandra)
alter table public.tasks
  alter column contact_id drop not null;

-- Μνήμη Αλεξάνδρας (προτιμήσεις/σημειώσεις χρήστη)
create table if not exists public.alexandra_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists idx_alexandra_memory_user on public.alexandra_memory (user_id, updated_at desc);

alter table public.alexandra_memory enable row level security;

drop policy if exists "alexandra memory own" on public.alexandra_memory;
create policy "alexandra memory own" on public.alexandra_memory for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Ημερολόγιο δραστηριότητας
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_name text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_created on public.activity_log (created_at desc);

alter table public.activity_log enable row level security;

drop policy if exists "activity log read" on public.activity_log;
create policy "activity log read" on public.activity_log for select to authenticated using (true);

-- Ανάθεση επαφών σε καμπάνια (μερική σχέση πολλαπλών-πολλαπλών)
create table if not exists public.campaign_contacts (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (campaign_id, contact_id)
);

create index if not exists idx_campaign_contacts_contact on public.campaign_contacts (contact_id);

alter table public.campaign_contacts enable row level security;
drop policy if exists "campaign contacts all" on public.campaign_contacts;
create policy "campaign contacts all" on public.campaign_contacts for all to authenticated using (true) with check (true);

-- Human-readable IDs (EP- / AIT-)
alter table public.contacts
  add column if not exists contact_code text;
alter table public.requests
  add column if not exists request_code text;

create unique index if not exists idx_contacts_contact_code_unique
  on public.contacts (contact_code)
  where contact_code is not null;
create unique index if not exists idx_requests_request_code_unique
  on public.requests (request_code)
  where request_code is not null;

-- One-time backfill (safe to re-run: only rows without code)
update public.contacts c
set contact_code = 'EP-' || lpad(n::text, 6, '0')
from (
  select id, row_number() over (order by created_at nulls last, id) as n
  from public.contacts
  where contact_code is null
) s
where c.id = s.id;

update public.requests r
set request_code = 'AIT-' || lpad(n::text, 6, '0')
from (
  select id, row_number() over (order by created_at nulls last, id) as n
  from public.requests
  where request_code is null
) s
where r.id = s.id;

-- Patronymic / metronymic (Greek official-style naming)
alter table public.contacts
  add column if not exists father_name text,
  add column if not exists mother_name text;

-- Ομάδες επαφών
create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#003476',
  year integer,
  description text,
  created_at timestamptz not null default now()
);
alter table public.contacts
  add column if not exists group_id uuid references public.contact_groups (id) on delete set null;
create index if not exists idx_contacts_group_id on public.contacts (group_id) where group_id is not null;

-- Second mobile + landline (σταθερό)
alter table public.contacts
  add column if not exists phone2 text,
  add column if not exists landline text;
alter table public.contact_groups enable row level security;
drop policy if exists "authenticated contact_groups" on public.contact_groups;
create policy "authenticated contact_groups" on public.contact_groups
  for all to authenticated using (true) with check (true);

-- Κατηγορίες events (χρώμα + εμφανιζόμενο όνομα στο πρόγραμμα)
create table if not exists public.event_categories (
  type_key text not null check (type_key in ('meeting', 'event', 'campaign', 'other')) primary key,
  name text not null,
  color text not null,
  updated_at timestamptz not null default now()
);
insert into public.event_categories (type_key, name, color) values
  ('meeting', 'Συνάντηση', '#003476'),
  ('event', 'Εκδήλωση', '#C9A84C'),
  ('campaign', 'Προεκλογικό', '#DC2626'),
  ('other', 'Άλλο', '#6B7280')
on conflict (type_key) do nothing;
alter table public.event_categories enable row level security;
drop policy if exists "authenticated event_categories" on public.event_categories;
create policy "authenticated event_categories" on public.event_categories
  for all to authenticated using (true) with check (true);

-- Ετικέτες επαφών (λεξιλόγιο + χρώμα· το contacts.tags παραμένει text[])
create table if not exists public.contact_tag_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#6B7280',
  created_at timestamptz not null default now(),
  unique (name)
);
alter table public.contact_tag_definitions enable row level security;
drop policy if exists "authenticated contact_tag_definitions" on public.contact_tag_definitions;
create policy "authenticated contact_tag_definitions" on public.contact_tag_definitions
  for all to authenticated using (true) with check (true);

-- Προτεραιότητες (εργασίες/φίλτρα) — κλειδιά High / Medium / Low
create table if not exists public.priority_levels (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  key text not null,
  label text not null,
  color text not null,
  updated_at timestamptz not null default now(),
  unique (key)
);
insert into public.priority_levels (sort_order, key, label, color) values
  (0, 'High', 'Υψηλή', '#DC2626'),
  (1, 'Medium', 'Μεσαία', '#D97706'),
  (2, 'Low', 'Χαμηλή', '#64748B')
on conflict (key) do nothing;
alter table public.priority_levels enable row level security;
drop policy if exists "authenticated priority_levels" on public.priority_levels;
create policy "authenticated priority_levels" on public.priority_levels
  for all to authenticated using (true) with check (true);

-- Κατηγορίες αιτημάτων
create table if not exists public.request_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (name)
);
insert into public.request_categories (name, color, sort_order) values
  ('Άλλο', '#6B7280', 0),
  ('Δημόσια υπηρεσία', '#2563EB', 1),
  ('Υγεία', '#059669', 2)
on conflict (name) do nothing;
alter table public.request_categories enable row level security;
drop policy if exists "authenticated request_categories" on public.request_categories;
create policy "authenticated request_categories" on public.request_categories
  for all to authenticated using (true) with check (true);

-- Καμπάνιες: τάση positive rate (json cache / analytics)
alter table public.campaigns
  add column if not exists sentiment_data jsonb;

-- SLA αιτημάτων
alter table public.request_categories
  add column if not exists sla_days integer not null default 14;
alter table public.requests
  add column if not exists sla_due_date date,
  add column if not exists sla_status text;

comment on column public.requests.sla_status is 'on_track | at_risk | overdue (για ανοικτά αιτήματα)';

-- Ρυθμίσεις εφαρμογής (Telegram, κ.λπ.)
create table if not exists public.crm_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.crm_settings enable row level security;
drop policy if exists "crm_settings all" on public.crm_settings;
create policy "crm_settings all" on public.crm_settings
  for all to authenticated using (true) with check (true);

-- Αποτελέσματα εκλογών ανά δήμο (π.χ. 2023)
create table if not exists public.electoral_results (
  id uuid primary key default gen_random_uuid(),
  municipality text not null,
  party text not null,
  percentage numeric(6,2) not null,
  year integer not null,
  created_at timestamptz not null default now(),
  unique (municipality, party, year)
);
create index if not exists idx_electoral_results_year on public.electoral_results (year);
alter table public.electoral_results enable row level security;
drop policy if exists "electoral_results all" on public.electoral_results;
create policy "electoral_results all" on public.electoral_results
  for all to authenticated using (true) with check (true);

-- Προβλεπόμενο score επαφής
alter table public.contacts
  add column if not exists predicted_score integer;

-- Έγγραφα
create table if not exists public.analyzed_documents (
  id uuid primary key default gen_random_uuid(),
  title text,
  content_summary text,
  key_points jsonb,
  analysis jsonb,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null
);
create index if not exists idx_analyzed_documents_user on public.analyzed_documents (user_id, created_at desc);
alter table public.analyzed_documents enable row level security;
drop policy if exists "analyzed_documents all" on public.analyzed_documents;
create policy "analyzed_documents all" on public.analyzed_documents
  for all to authenticated using (true) with check (true);

create table if not exists public.press_releases (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  tone text,
  created_at timestamptz default now(),
  user_id uuid references auth.users (id) on delete set null
);
alter table public.press_releases enable row level security;
drop policy if exists "press_releases all" on public.press_releases;
create policy "press_releases all" on public.press_releases
  for all to authenticated using (true) with check (true);

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  recipient text,
  subject text,
  content text,
  citizen_name text,
  created_at timestamptz default now(),
  user_id uuid references auth.users (id) on delete set null
);
alter table public.letters enable row level security;
drop policy if exists "letters all" on public.letters;
create policy "letters all" on public.letters
  for all to authenticated using (true) with check (true);

-- Βουλευτική δραστηριότητα
create table if not exists public.parliamentary_questions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  ministry text,
  status text not null default 'Κατατέθηκε',
  submitted_date date,
  answer_date date,
  answer_text text,
  tags text[],
  related_contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_parl_questions_status on public.parliamentary_questions (status);
create index if not exists idx_parl_questions_muni on public.parliamentary_questions (ministry);
alter table public.parliamentary_questions enable row level security;
drop policy if exists "parl_questions all" on public.parliamentary_questions;
create policy "parl_questions all" on public.parliamentary_questions
  for all to authenticated using (true) with check (true);

create table if not exists public.legislation (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  law_number text,
  status text not null default 'Υπό Εξέταση',
  vote text,
  date date,
  ministry text,
  impact_description text,
  url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_legislation_status on public.legislation (status);
alter table public.legislation enable row level security;
drop policy if exists "legislation all" on public.legislation;
create policy "legislation all" on public.legislation
  for all to authenticated using (true) with check (true);

-- Αποθηκευμένα άρθρα (media monitoring)
create table if not exists public.media_saved_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source text,
  link text,
  published_at text,
  snippet text,
  query text,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null
);
create index if not exists idx_media_saved_user on public.media_saved_articles (user_id, created_at desc);
alter table public.media_saved_articles enable row level security;
drop policy if exists "media_saved all" on public.media_saved_articles;
create policy "media_saved all" on public.media_saved_articles
  for all to authenticated using (true) with check (true);

-- Εθελοντές (επαφή)
alter table public.contacts
  add column if not exists is_volunteer boolean default false,
  add column if not exists volunteer_role text,
  add column if not exists volunteer_area text,
  add column if not exists volunteer_since date,
  add column if not exists language text default 'el';

-- Εκδηλώσεις
create table if not exists public.events_local (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  date date not null,
  start_time time,
  end_time time,
  location text,
  type text not null default 'Εκδήλωση',
  max_attendees int,
  status text not null default 'Προγραμματισμένη',
  created_at timestamptz not null default now()
);
create index if not exists idx_events_local_date on public.events_local (date);
alter table public.events_local enable row level security;
drop policy if exists "events_local all" on public.events_local;
create policy "events_local all" on public.events_local
  for all to authenticated using (true) with check (true);

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events_local (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  status text not null default 'Επιβεβαιωμένος',
  created_at timestamptz not null default now(),
  unique (event_id, contact_id)
);
create index if not exists idx_event_rsvps_event on public.event_rsvps (event_id);
create index if not exists idx_event_rsvps_contact on public.event_rsvps (contact_id);
alter table public.event_rsvps enable row level security;
drop policy if exists "event_rsvps all" on public.event_rsvps;
create policy "event_rsvps all" on public.event_rsvps
  for all to authenticated using (true) with check (true);

-- Υποστηρικτές / δωρεές
create table if not exists public.supporters (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete set null,
  support_type text,
  amount decimal(12,2),
  date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_supporters_contact on public.supporters (contact_id);
alter table public.supporters enable row level security;
drop policy if exists "supporters all" on public.supporters;
create policy "supporters all" on public.supporters
  for all to authenticated using (true) with check (true);

-- Ιχνηλάτης δημιουργού/επεξεργασίας επαφής
alter table public.contacts
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz;
update public.contacts
  set updated_at = coalesce(updated_at, created_at::timestamptz, now())
  where updated_at is null;

-- Σημειώσεις επαφής (χρονολόγιο)
create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_contact_notes_contact on public.contact_notes (contact_id, created_at desc);
alter table public.contact_notes enable row level security;
drop policy if exists "contact_notes all" on public.contact_notes;
create policy "contact_notes all" on public.contact_notes
  for all to authenticated using (true) with check (true);

-- Γεωγραφικά: δήμοι, εκλ. διαμερίσματα, τοπωνύμια (admin CRM)
create table if not exists public.municipalities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  regional_unit text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_municipalities_name on public.municipalities (name);

create table if not exists public.electoral_districts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_electoral_dist_muni_name
  on public.electoral_districts (municipality_id, name);

create table if not exists public.toponyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  municipality_id uuid not null references public.municipalities (id) on delete cascade,
  electoral_district_id uuid references public.electoral_districts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_toponyms_muni_district on public.toponyms (municipality_id, electoral_district_id);

alter table public.municipalities enable row level security;
alter table public.electoral_districts enable row level security;
alter table public.toponyms enable row level security;

drop policy if exists "municipalities read" on public.municipalities;
create policy "municipalities read" on public.municipalities for select to authenticated using (true);
drop policy if exists "municipalities write admin" on public.municipalities;
create policy "municipalities write admin" on public.municipalities for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "electoral_districts read" on public.electoral_districts;
create policy "electoral_districts read" on public.electoral_districts for select to authenticated using (true);
drop policy if exists "electoral_districts write admin" on public.electoral_districts;
create policy "electoral_districts write admin" on public.electoral_districts for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

drop policy if exists "toponyms read" on public.toponyms;
create policy "toponyms read" on public.toponyms for select to authenticated using (true);
drop policy if exists "toponyms write admin" on public.toponyms;
create policy "toponyms write admin" on public.toponyms for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

-- Saved filter aliases (used on contacts + Alexandra)
create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid (),
  name text not null unique,
  description text,
  filters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_filters_name on public.saved_filters (name);

alter table public.saved_filters enable row level security;

drop policy if exists "saved_filters read" on public.saved_filters;
create policy "saved_filters read" on public.saved_filters for select to authenticated using (true);
drop policy if exists "saved_filters write admin" on public.saved_filters;
create policy "saved_filters write admin" on public.saved_filters for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid () and p.role = 'admin'));

-- Αιτήματα: επαφή που αφορά, προτεραιότητα, σημειώσεις
alter table public.requests
  add column if not exists affected_contact_id uuid references public.contacts (id) on delete set null;
create index if not exists idx_requests_affected_contact on public.requests (affected_contact_id);
alter table public.requests
  add column if not exists priority text default 'Medium';

create table if not exists public.request_notes (
  id uuid primary key default gen_random_uuid (),
  request_id uuid not null references public.requests (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_request_notes_request on public.request_notes (request_id, created_at desc);
alter table public.request_notes enable row level security;
drop policy if exists "request_notes all" on public.request_notes;
create policy "request_notes all" on public.request_notes
  for all to authenticated
  using (true)
  with check (true);

-- User profile: public avatar URL + UI preferences
alter table public.profiles
  add column if not exists avatar_url text;
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}';

-- Public avatars (path: {userId}/{filename})
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select to public using (bucket_id = 'avatars');

drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername (name))[1] = (select auth.uid()::text));

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername (name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and (storage.foldername (name))[1] = (select auth.uid()::text));

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername (name))[1] = (select auth.uid()::text));

-- ========== Πύλη πολιτών (Portal) + Νέα δημόσιας εμφάνισης ==========
alter table public.profiles
  add column if not exists is_portal boolean not null default false;

create table if not exists public.portal_users (
  id uuid primary key default gen_random_uuid (),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now ()
);

create index if not exists idx_portal_users_auth on public.portal_users (auth_user_id);
create index if not exists idx_portal_users_contact on public.portal_users (contact_id);
create index if not exists idx_portal_users_email on public.portal_users (email);

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  slug text not null,
  excerpt text,
  content text not null,
  cover_image text,
  published boolean not null default false,
  published_at timestamptz,
  category text not null default 'Ανακοίνωση',
  tags text[],
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);
create unique index if not exists news_posts_slug_uniq on public.news_posts (slug);
create index if not exists news_posts_published on public.news_posts (published, published_at desc);

alter table public.requests
  add column if not exists portal_visible boolean not null default true;
alter table public.requests
  add column if not exists portal_message text;

alter table public.portal_users enable row level security;
alter table public.news_posts enable row level security;

drop policy if exists "portal_users own" on public.portal_users;
create policy "portal_users own"
  on public.portal_users
  for all
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Δημόσια: δημοσιευμένα άρθρα (ανώνυμα + σύνδεση)
drop policy if exists "news public read" on public.news_posts;
create policy "news public read" on public.news_posts for
select
  to anon, authenticated
  using (published = true);

-- Διαχείριση: μόνον προσωπικό CRM (όχι is_portal)
drop policy if exists "news staff write" on public.news_posts;
create policy "news staff write" on public.news_posts
  for all
  to authenticated
  using (
    exists (
        select
          1
        from
          public.profiles p
        where
          p.id = auth.uid ()
          and coalesce(p.is_portal, false) = false
          and p.role in ('admin', 'manager')
      )
  )
  with check (
    exists (
        select
          1
        from
          public.profiles p
        where
          p.id = auth.uid ()
          and coalesce(p.is_portal, false) = false
          and p.role in ('admin', 'manager')
      )
  );

-- RLS: επαφές — ξεχωριστά CRM vs πύλη
drop policy if exists "authenticated contacts" on public.contacts;
create policy "contacts_crm" on public.contacts
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );
create policy "contacts_portal_read" on public.contacts for
select
  to authenticated
  using (
    exists (
        select
          1
        from
          public.portal_users pu
        where
          pu.auth_user_id = auth.uid ()
          and contacts.id = pu.contact_id
      )
  );

-- RLS: αιτήματα — CRM full access, πύλη read/insert own
drop policy if exists "authenticated requests" on public.requests;
create policy "requests_crm" on public.requests
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );
create policy "requests_portal_read" on public.requests for
select
  to authenticated
  using (
    exists (
        select
          1
        from
          public.portal_users pu
        where
          pu.auth_user_id = auth.uid ()
          and requests.contact_id = pu.contact_id
      )
    and coalesce (requests.portal_visible, true) = true
  );
create policy "requests_portal_ins" on public.requests for insert to authenticated
  with check (
    exists (
        select
          1
        from
          public.portal_users pu
        where
          pu.auth_user_id = auth.uid ()
          and pu.contact_id = contact_id
      )
  );

-- Email αποστολές (καταγραφή)
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid (),
  to_email text not null,
  subject text not null,
  template text not null,
  status text not null default 'sent',
  contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now ()
);

create index if not exists idx_email_logs_created on public.email_logs (created_at desc);
create index if not exists idx_email_logs_contact on public.email_logs (contact_id);

alter table public.email_logs enable row level security;
drop policy if exists "email_logs crm read" on public.email_logs;
create policy "email_logs crm read" on public.email_logs for
select
  to authenticated
  using (
    exists (
        select
          1
        from
          public.profiles p
        where
          p.id = auth.uid ()
          and coalesce(p.is_portal, false) = false
          and p.role in ('admin', 'manager')
      )
  );

alter table public.profiles
  add column if not exists theme text not null default 'dark';

alter table public.portal_users
  add column if not exists verification_token text;
alter table public.portal_users
  add column if not exists push_subscription jsonb;

alter table public.contacts
  add column if not exists portal_invite_token text;
create unique index if not exists contacts_portal_invite_token_uniq on public.contacts (portal_invite_token)
  where
    portal_invite_token is not null;

-- --- Feature pack: WhatsApp, documents, polls, predictive list, AI cache, appointments ---

alter table public.electoral_results
  add column if not exists votes integer;

alter table public.campaigns
  add column if not exists channel text not null default 'call';

alter table public.contacts
  add column if not exists ai_summary text,
  add column if not exists ai_summary_updated_at timestamptz;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid (),
  contact_id uuid references public.contacts (id) on delete set null,
  direction text not null default 'outbound',
  message text not null,
  status text not null default 'sent',
  whatsapp_message_id text,
  created_at timestamptz not null default now ()
);

create index if not exists idx_whatsapp_messages_created on public.whatsapp_messages (created_at desc);
create index if not exists idx_whatsapp_messages_contact on public.whatsapp_messages (contact_id);

alter table public.whatsapp_messages enable row level security;
drop policy if exists "whatsapp_messages crm" on public.whatsapp_messages;
create policy "whatsapp_messages crm" on public.whatsapp_messages
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid (),
  contact_id uuid references public.contacts (id) on delete cascade,
  request_id uuid references public.requests (id) on delete cascade,
  name text not null,
  file_url text not null,
  file_type text,
  file_size integer,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now ()
);

create index if not exists idx_documents_contact on public.documents (contact_id, created_at desc);
create index if not exists idx_documents_request on public.documents (request_id, created_at desc);

alter table public.documents enable row level security;
drop policy if exists "documents crm" on public.documents;
create policy "documents crm" on public.documents
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents storage crm read" on storage.objects;
create policy "documents storage crm read" on storage.objects for
select
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

drop policy if exists "documents storage crm write" on storage.objects;
create policy "documents storage crm write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

drop policy if exists "documents storage crm update" on storage.objects;
create policy "documents storage crm update" on storage.objects for
update
  to authenticated
  using (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

drop policy if exists "documents storage crm delete" on storage.objects;
create policy "documents storage crm delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

create table if not exists public.office_appointments (
  id uuid primary key default gen_random_uuid (),
  contact_id uuid references public.contacts (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  citizen_name text,
  citizen_phone text,
  reason text,
  google_event_id text,
  created_at timestamptz not null default now ()
);

create index if not exists idx_office_appointments_contact on public.office_appointments (contact_id, starts_at desc);

alter table public.office_appointments enable row level security;
drop policy if exists "office_appointments crm" on public.office_appointments;
create policy "office_appointments crm" on public.office_appointments
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid (),
  title text not null,
  question text not null,
  options jsonb not null,
  status text not null default 'active',
  target_group_id uuid references public.contact_groups (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now (),
  ends_at timestamptz
);

create index if not exists idx_polls_status on public.polls (status, created_at desc);

alter table public.polls enable row level security;
drop policy if exists "polls crm" on public.polls;
create policy "polls crm" on public.polls
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

create table if not exists public.poll_responses (
  id uuid primary key default gen_random_uuid (),
  poll_id uuid not null references public.polls (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now (),
  unique (poll_id, contact_id)
);

create index if not exists idx_poll_responses_poll on public.poll_responses (poll_id);

alter table public.poll_responses enable row level security;
drop policy if exists "poll_responses crm" on public.poll_responses;
create policy "poll_responses crm" on public.poll_responses
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

create table if not exists public.daily_call_lists (
  id uuid primary key default gen_random_uuid (),
  date date not null unique,
  contact_ids jsonb not null,
  scores jsonb not null,
  created_at timestamptz not null default now ()
);

create table if not exists public.daily_call_list_skips (
  id uuid primary key default gen_random_uuid (),
  date date not null,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  created_at timestamptz not null default now (),
  unique (date, contact_id)
);

alter table public.daily_call_lists enable row level security;
drop policy if exists "daily_call_lists crm" on public.daily_call_lists;
create policy "daily_call_lists crm" on public.daily_call_lists
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );

alter table public.daily_call_list_skips enable row level security;
drop policy if exists "daily_call_list_skips crm" on public.daily_call_list_skips;
create policy "daily_call_list_skips crm" on public.daily_call_list_skips
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid () and coalesce(p.is_portal, false) = false)
  );
