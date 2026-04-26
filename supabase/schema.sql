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
