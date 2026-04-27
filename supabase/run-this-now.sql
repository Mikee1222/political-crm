-- =============================================================================
-- run-this-now.sql — Safe idempotent sync for production
-- Add missing tables/columns from schema.sql. Re-run: OK (IF NOT EXISTS everywhere
-- applicable; policies use DROP IF EXISTS + CREATE).
-- Prerequisites: public.contacts, public.requests, public.campaigns, public.profiles,
-- auth.users (Supabase). If contact_groups is missing, it is created below.
-- Does NOT: replace RLS on contacts/requests (portal policies); add only RLS for
-- objects defined in this file. Extend main schema if you need full policy sync.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Prerequisite: public.polls references contact_groups
-- ---------------------------------------------------------------------------
create table if not exists public.contact_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#003476',
  year integer,
  description text,
  created_at timestamptz not null default now()
);
alter table public.contact_groups enable row level security;
drop policy if exists "authenticated contact_groups" on public.contact_groups;
create policy "authenticated contact_groups" on public.contact_groups
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 1) Tables (CREATE IF NOT EXISTS) — order respects foreign keys
-- ---------------------------------------------------------------------------

create table if not exists public.crm_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.electoral_results (
  id uuid primary key default gen_random_uuid(),
  municipality text not null,
  party text not null,
  percentage numeric(6,2) not null,
  year integer not null,
  created_at timestamptz not null default now(),
  unique (municipality, party, year)
);

create table if not exists public.analyzed_documents (
  id uuid primary key default gen_random_uuid(),
  title text,
  content_summary text,
  key_points jsonb,
  analysis jsonb,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null
);

create table if not exists public.press_releases (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  tone text,
  created_at timestamptz default now(),
  user_id uuid references auth.users (id) on delete set null
);

create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  recipient text,
  subject text,
  content text,
  citizen_name text,
  created_at timestamptz default now(),
  user_id uuid references auth.users (id) on delete set null
);

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

create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events_local (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  status text not null default 'Επιβεβαιωμένος',
  created_at timestamptz not null default now(),
  unique (event_id, contact_id)
);

create table if not exists public.supporters (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete set null,
  support_type text,
  amount decimal(12,2),
  date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_notes (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

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

create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  filters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_saved_filters_name on public.saved_filters (name);

create table if not exists public.request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text,
  email text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists news_posts_slug_uniq on public.news_posts (slug);
create index if not exists news_posts_published on public.news_posts (published, published_at desc);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  subject text not null,
  template text not null,
  status text not null default 'sent',
  contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete set null,
  direction text not null default 'outbound',
  message text not null,
  status text not null default 'sent',
  whatsapp_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete cascade,
  request_id uuid references public.requests (id) on delete cascade,
  name text not null,
  file_url text not null,
  file_type text,
  file_size integer,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.office_appointments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  citizen_name text,
  citizen_phone text,
  reason text,
  google_event_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  question text not null,
  options jsonb not null,
  status text not null default 'active',
  target_group_id uuid references public.contact_groups (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ends_at timestamptz
);

create table if not exists public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, contact_id)
);

create table if not exists public.daily_call_lists (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  contact_ids jsonb not null,
  scores jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_call_list_skips (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (date, contact_id)
);

-- ---------------------------------------------------------------------------
-- 2) Indexes (for tables above)
-- ---------------------------------------------------------------------------
create index if not exists idx_electoral_results_year on public.electoral_results (year);
create index if not exists idx_analyzed_documents_user on public.analyzed_documents (user_id, created_at desc);
create index if not exists idx_parl_questions_status on public.parliamentary_questions (status);
create index if not exists idx_parl_questions_muni on public.parliamentary_questions (ministry);
create index if not exists idx_legislation_status on public.legislation (status);
create index if not exists idx_media_saved_user on public.media_saved_articles (user_id, created_at desc);
create index if not exists idx_events_local_date on public.events_local (date);
create index if not exists idx_event_rsvps_event on public.event_rsvps (event_id);
create index if not exists idx_event_rsvps_contact on public.event_rsvps (contact_id);
create index if not exists idx_supporters_contact on public.supporters (contact_id);
create index if not exists idx_contact_notes_contact on public.contact_notes (contact_id, created_at desc);
create index if not exists idx_request_notes_request on public.request_notes (request_id, created_at desc);
create index if not exists idx_portal_users_auth on public.portal_users (auth_user_id);
create index if not exists idx_portal_users_contact on public.portal_users (contact_id);
create index if not exists idx_portal_users_email on public.portal_users (email);
create index if not exists idx_email_logs_created on public.email_logs (created_at desc);
create index if not exists idx_email_logs_contact on public.email_logs (contact_id);
create index if not exists idx_whatsapp_messages_created on public.whatsapp_messages (created_at desc);
create index if not exists idx_whatsapp_messages_contact on public.whatsapp_messages (contact_id);
create index if not exists idx_documents_contact on public.documents (contact_id, created_at desc);
create index if not exists idx_documents_request on public.documents (request_id, created_at desc);
create index if not exists idx_office_appointments_contact on public.office_appointments (contact_id, starts_at desc);
create index if not exists idx_polls_status on public.polls (status, created_at desc);
create index if not exists idx_poll_responses_poll on public.poll_responses (poll_id);

-- ---------------------------------------------------------------------------
-- 3) ALTER: missing columns on core tables (from schema.sql)
-- ---------------------------------------------------------------------------
alter table public.campaigns
  add column if not exists description text,
  add column if not exists status text not null default 'active',
  add column if not exists sentiment_data jsonb,
  add column if not exists channel text not null default 'call';

alter table public.tasks
  add column if not exists description text,
  add column if not exists priority text default 'Medium',
  add column if not exists category text,
  add column if not exists completed_at timestamptz;
alter table public.tasks
  alter column contact_id drop not null;

alter table public.google_tokens
  add column if not exists expiry timestamp with time zone;
update public.google_tokens
  set expiry = coalesce(expiry, expires_at)
  where expiry is null and expires_at is not null;

-- Contacts: optional phone, codes, location, volunteers, audit, AI, portal invite
alter table public.contacts drop constraint if exists contacts_phone_key;
alter table public.contacts
  alter column phone drop not null;
alter table public.contacts
  add column if not exists nickname text,
  add column if not exists spouse_name text,
  add column if not exists name_day date,
  add column if not exists birthday date,
  add column if not exists municipality text,
  add column if not exists electoral_district text,
  add column if not exists toponym text,
  add column if not exists contact_code text,
  add column if not exists father_name text,
  add column if not exists mother_name text,
  add column if not exists group_id uuid references public.contact_groups (id) on delete set null,
  add column if not exists phone2 text,
  add column if not exists landline text,
  add column if not exists predicted_score integer,
  add column if not exists is_volunteer boolean default false,
  add column if not exists volunteer_role text,
  add column if not exists volunteer_area text,
  add column if not exists volunteer_since date,
  add column if not exists language text default 'el',
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz,
  add column if not exists portal_invite_token text,
  add column if not exists ai_summary text,
  add column if not exists ai_summary_updated_at timestamptz;
update public.contacts
  set updated_at = coalesce(updated_at, created_at::timestamptz, now())
  where updated_at is null;
create index if not exists idx_contacts_group_id on public.contacts (group_id) where group_id is not null;

-- Human-readable request codes: columns first, then unique index, then backfill
alter table public.requests
  add column if not exists request_code text;
alter table public.requests
  add column if not exists affected_contact_id uuid references public.contacts (id) on delete set null,
  add column if not exists priority text default 'Medium',
  add column if not exists sla_due_date date,
  add column if not exists sla_status text,
  add column if not exists portal_visible boolean not null default true,
  add column if not exists portal_message text;
create index if not exists idx_requests_affected_contact on public.requests (affected_contact_id);
comment on column public.requests.sla_status is 'on_track | at_risk | overdue (για ανοικτά αιτήματα)';

create unique index if not exists idx_contacts_contact_code_unique
  on public.contacts (contact_code)
  where contact_code is not null;
create unique index if not exists idx_requests_request_code_unique
  on public.requests (request_code)
  where request_code is not null;
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
create unique index if not exists contacts_portal_invite_token_uniq
  on public.contacts (portal_invite_token)
  where portal_invite_token is not null;

-- request_categories: SLA (table may already exist in older DBs)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'request_categories'
  ) then
    alter table public.request_categories
      add column if not exists sla_days integer not null default 14;
  end if;
end $$;

-- Profiles: CRM + portal
alter table public.profiles
  add column if not exists avatar_url text;
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}';
alter table public.profiles
  add column if not exists is_portal boolean not null default false;
alter table public.profiles
  add column if not exists theme text not null default 'dark';

-- Portal users: optional columns
alter table public.portal_users
  add column if not exists verification_token text;
alter table public.portal_users
  add column if not exists push_subscription jsonb;

-- Electoral results: vote count
alter table public.electoral_results
  add column if not exists votes integer;

-- ---------------------------------------------------------------------------
-- 4) RLS: enable + policies for tables in this file (new feature tables)
-- ---------------------------------------------------------------------------
alter table public.crm_settings enable row level security;
drop policy if exists "crm_settings all" on public.crm_settings;
create policy "crm_settings all" on public.crm_settings
  for all to authenticated using (true) with check (true);

alter table public.electoral_results enable row level security;
drop policy if exists "electoral_results all" on public.electoral_results;
create policy "electoral_results all" on public.electoral_results
  for all to authenticated using (true) with check (true);

alter table public.analyzed_documents enable row level security;
drop policy if exists "analyzed_documents all" on public.analyzed_documents;
create policy "analyzed_documents all" on public.analyzed_documents
  for all to authenticated using (true) with check (true);

alter table public.press_releases enable row level security;
drop policy if exists "press_releases all" on public.press_releases;
create policy "press_releases all" on public.press_releases
  for all to authenticated using (true) with check (true);

alter table public.letters enable row level security;
drop policy if exists "letters all" on public.letters;
create policy "letters all" on public.letters
  for all to authenticated using (true) with check (true);

alter table public.parliamentary_questions enable row level security;
drop policy if exists "parl_questions all" on public.parliamentary_questions;
create policy "parl_questions all" on public.parliamentary_questions
  for all to authenticated using (true) with check (true);

alter table public.legislation enable row level security;
drop policy if exists "legislation all" on public.legislation;
create policy "legislation all" on public.legislation
  for all to authenticated using (true) with check (true);

alter table public.media_saved_articles enable row level security;
drop policy if exists "media_saved all" on public.media_saved_articles;
create policy "media_saved all" on public.media_saved_articles
  for all to authenticated using (true) with check (true);

alter table public.events_local enable row level security;
drop policy if exists "events_local all" on public.events_local;
create policy "events_local all" on public.events_local
  for all to authenticated using (true) with check (true);

alter table public.event_rsvps enable row level security;
drop policy if exists "event_rsvps all" on public.event_rsvps;
create policy "event_rsvps all" on public.event_rsvps
  for all to authenticated using (true) with check (true);

alter table public.supporters enable row level security;
drop policy if exists "supporters all" on public.supporters;
create policy "supporters all" on public.supporters
  for all to authenticated using (true) with check (true);

alter table public.contact_notes enable row level security;
drop policy if exists "contact_notes all" on public.contact_notes;
create policy "contact_notes all" on public.contact_notes
  for all to authenticated using (true) with check (true);

alter table public.municipalities enable row level security;
drop policy if exists "municipalities read" on public.municipalities;
create policy "municipalities read" on public.municipalities for select to authenticated using (true);
drop policy if exists "municipalities write admin" on public.municipalities;
create policy "municipalities write admin" on public.municipalities for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table public.electoral_districts enable row level security;
drop policy if exists "electoral_districts read" on public.electoral_districts;
create policy "electoral_districts read" on public.electoral_districts for select to authenticated using (true);
drop policy if exists "electoral_districts write admin" on public.electoral_districts;
create policy "electoral_districts write admin" on public.electoral_districts for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table public.toponyms enable row level security;
drop policy if exists "toponyms read" on public.toponyms;
create policy "toponyms read" on public.toponyms for select to authenticated using (true);
drop policy if exists "toponyms write admin" on public.toponyms;
create policy "toponyms write admin" on public.toponyms for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table public.saved_filters enable row level security;
drop policy if exists "saved_filters read" on public.saved_filters;
create policy "saved_filters read" on public.saved_filters for select to authenticated using (true);
drop policy if exists "saved_filters write admin" on public.saved_filters;
create policy "saved_filters write admin" on public.saved_filters for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

alter table public.request_notes enable row level security;
drop policy if exists "request_notes all" on public.request_notes;
create policy "request_notes all" on public.request_notes
  for all to authenticated using (true) with check (true);

alter table public.portal_users enable row level security;
drop policy if exists "portal_users own" on public.portal_users;
create policy "portal_users own" on public.portal_users
  for all to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

alter table public.news_posts enable row level security;
drop policy if exists "news public read" on public.news_posts;
create policy "news public read" on public.news_posts
  for select to anon, authenticated
  using (published = true);
drop policy if exists "news staff write" on public.news_posts;
create policy "news staff write" on public.news_posts
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_portal, false) = false
        and p.role in ('admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_portal, false) = false
        and p.role in ('admin', 'manager')
    )
  );

alter table public.email_logs enable row level security;
drop policy if exists "email_logs crm read" on public.email_logs;
create policy "email_logs crm read" on public.email_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_portal, false) = false
        and p.role in ('admin', 'manager')
    )
  );

alter table public.whatsapp_messages enable row level security;
drop policy if exists "whatsapp_messages crm" on public.whatsapp_messages;
create policy "whatsapp_messages crm" on public.whatsapp_messages
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false));

alter table public.documents enable row level security;
drop policy if exists "documents crm" on public.documents;
create policy "documents crm" on public.documents
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false));

alter table public.office_appointments enable row level security;
drop policy if exists "office_appointments crm" on public.office_appointments;
create policy "office_appointments crm" on public.office_appointments
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false));

alter table public.polls enable row level security;
drop policy if exists "polls crm" on public.polls;
create policy "polls crm" on public.polls
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false));

alter table public.poll_responses enable row level security;
drop policy if exists "poll_responses crm" on public.poll_responses;
create policy "poll_responses crm" on public.poll_responses
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false));

alter table public.daily_call_lists enable row level security;
drop policy if exists "daily_call_lists crm" on public.daily_call_lists;
create policy "daily_call_lists crm" on public.daily_call_lists
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false));

alter table public.daily_call_list_skips enable row level security;
drop policy if exists "daily_call_list_skips crm" on public.daily_call_list_skips;
create policy "daily_call_list_skips crm" on public.daily_call_list_skips
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false));

-- ---------------------------------------------------------------------------
-- 5) Storage: document bucket (CRM file upload)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
  on conflict (id) do nothing;
drop policy if exists "documents storage crm read" on storage.objects;
create policy "documents storage crm read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false)
  );
drop policy if exists "documents storage crm write" on storage.objects;
create policy "documents storage crm write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false)
  );
drop policy if exists "documents storage crm update" on storage.objects;
create policy "documents storage crm update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false)
  )
  with check (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false)
  );
drop policy if exists "documents storage crm delete" on storage.objects;
create policy "documents storage crm delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_portal, false) = false)
  );
