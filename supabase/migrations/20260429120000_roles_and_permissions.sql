-- CRM roles registry + per-role permission matrix (admin-managed).

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid (),
  name text not null unique,
  label text not null,
  color text not null default '#003476',
  description text,
  is_system boolean not null default false,
  access_tier text not null default 'caller' check (access_tier in ('caller', 'manager', 'admin')),
  created_at timestamptz not null default now ()
);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid (),
  role_name text not null references public.roles (name) on delete cascade,
  permission_key text not null,
  allowed boolean not null default false,
  unique (role_name, permission_key)
);

create index if not exists idx_role_permissions_role on public.role_permissions (role_name);
create index if not exists idx_role_permissions_key on public.role_permissions (permission_key);

insert into
  public.roles (name, label, color, description, is_system, access_tier)
values
  ('admin', 'Διαχειριστής', '#003476', 'Πλήρης πρόσβαση CRM και ρυθμίσεων.', true, 'admin'),
  ('manager', 'Διευθυντής', '#1e5fa8', 'Διαχείριση ομάδας και εργαλείων χωρίς διαχείριση ρόλων.', true, 'manager'),
  ('caller', 'Καλητής', '#64748b', 'Κλήσεις και επαφές — περιορισμένη πρόσβαση.', true, 'caller')
on conflict (name) do nothing;

-- If table existed without access_tier (re-run safety)
alter table public.roles
  add column if not exists access_tier text not null default 'caller' check (access_tier in ('caller', 'manager', 'admin'));

update public.roles
set
  access_tier = 'admin'
where
  name = 'admin';

update public.roles
set
  access_tier = 'manager'
where
  name = 'manager';

update public.roles
set
  access_tier = 'caller'
where
  name = 'caller';

-- Relax profiles.role to any registered role name
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles drop constraint if exists profiles_role_fk;

alter table public.profiles
  add constraint profiles_role_fk foreign key (role) references public.roles (name) on update cascade on delete restrict;

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists "roles crm read" on public.roles;
create policy "roles crm read" on public.roles for
select
  to authenticated using (
    exists (
      select 1
      from public.profiles p
      where
        p.id = auth.uid ()
        and coalesce(p.is_portal, false) = false
    )
  );

drop policy if exists "roles admin write" on public.roles;
create policy "roles admin write" on public.roles for all to authenticated using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and p.role = 'admin'
      and coalesce(p.is_portal, false) = false
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and p.role = 'admin'
      and coalesce(p.is_portal, false) = false
  )
);

drop policy if exists "role_permissions crm read own role" on public.role_permissions;
create policy "role_permissions crm read own role" on public.role_permissions for
select
  to authenticated using (
    exists (
      select 1
      from public.profiles p
      where
        p.id = auth.uid ()
        and coalesce(p.is_portal, false) = false
        and (
          p.role = 'admin'
          or role_permissions.role_name = p.role
        )
    )
  );

drop policy if exists "role_permissions admin write" on public.role_permissions;
create policy "role_permissions admin write" on public.role_permissions for all to authenticated using (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and p.role = 'admin'
      and coalesce(p.is_portal, false) = false
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where
      p.id = auth.uid ()
      and p.role = 'admin'
      and coalesce(p.is_portal, false) = false
  )
);

-- Seed permission matrix (idempotent)
with keys as (
  select
    unnest(
      array[
        'contacts_view',
        'contacts_create',
        'contacts_edit',
        'contacts_delete',
        'contacts_export',
        'contacts_import',
        'requests_view',
        'requests_create',
        'requests_edit',
        'requests_delete',
        'campaigns_view',
        'campaigns_create',
        'campaigns_start',
        'tasks_view',
        'tasks_create',
        'tasks_assign',
        'analytics_view',
        'documents_view',
        'documents_upload',
        'settings_view',
        'settings_edit',
        'users_manage',
        'roles_manage',
        'events_view',
        'events_create',
        'volunteers_view',
        'polls_view',
        'polls_create',
        'alexandra_use',
        'alexandra_bulk_delete',
        'alexandra_bulk_update',
        'alexandra_import',
        'alexandra_tool_bulk_delete_contacts',
        'alexandra_tool_bulk_update_contacts',
        'alexandra_tool_start_campaign',
        'alexandra_tool_send_whatsapp',
        'alexandra_tool_export_contacts',
        'alexandra_tool_create_user',
        'alexandra_tool_delete_data',
        'retell_call',
        'whatsapp_send',
        'export_data'
      ]
    ) as permission_key
)
insert into
  public.role_permissions (role_name, permission_key, allowed)
select
  'admin',
  permission_key,
  true
from
  keys
on conflict (role_name, permission_key) do update
set
  allowed = excluded.allowed;

with keys as (
  select
    unnest(
      array[
        'contacts_view',
        'contacts_create',
        'contacts_edit',
        'contacts_delete',
        'contacts_export',
        'contacts_import',
        'requests_view',
        'requests_create',
        'requests_edit',
        'requests_delete',
        'campaigns_view',
        'campaigns_create',
        'campaigns_start',
        'tasks_view',
        'tasks_create',
        'tasks_assign',
        'analytics_view',
        'documents_view',
        'documents_upload',
        'settings_view',
        'settings_edit',
        'users_manage',
        'roles_manage',
        'events_view',
        'events_create',
        'volunteers_view',
        'polls_view',
        'polls_create',
        'alexandra_use',
        'alexandra_bulk_delete',
        'alexandra_bulk_update',
        'alexandra_import',
        'alexandra_tool_bulk_delete_contacts',
        'alexandra_tool_bulk_update_contacts',
        'alexandra_tool_start_campaign',
        'alexandra_tool_send_whatsapp',
        'alexandra_tool_export_contacts',
        'alexandra_tool_create_user',
        'alexandra_tool_delete_data',
        'retell_call',
        'whatsapp_send',
        'export_data'
      ]
    ) as permission_key
)
insert into
  public.role_permissions (role_name, permission_key, allowed)
select
  'manager',
  permission_key,
  case
    when permission_key in (
      'users_manage',
      'roles_manage',
      'settings_edit',
      'alexandra_tool_create_user',
      'alexandra_tool_delete_data'
    ) then false
    else true
  end
from
  keys
on conflict (role_name, permission_key) do update
set
  allowed = excluded.allowed;

with keys as (
  select
    unnest(
      array[
        'contacts_view',
        'contacts_create',
        'contacts_edit',
        'contacts_delete',
        'contacts_export',
        'contacts_import',
        'requests_view',
        'requests_create',
        'requests_edit',
        'requests_delete',
        'campaigns_view',
        'campaigns_create',
        'campaigns_start',
        'tasks_view',
        'tasks_create',
        'tasks_assign',
        'analytics_view',
        'documents_view',
        'documents_upload',
        'settings_view',
        'settings_edit',
        'users_manage',
        'roles_manage',
        'events_view',
        'events_create',
        'volunteers_view',
        'polls_view',
        'polls_create',
        'alexandra_use',
        'alexandra_bulk_delete',
        'alexandra_bulk_update',
        'alexandra_import',
        'alexandra_tool_bulk_delete_contacts',
        'alexandra_tool_bulk_update_contacts',
        'alexandra_tool_start_campaign',
        'alexandra_tool_send_whatsapp',
        'alexandra_tool_export_contacts',
        'alexandra_tool_create_user',
        'alexandra_tool_delete_data',
        'retell_call',
        'whatsapp_send',
        'export_data'
      ]
    ) as permission_key
)
insert into
  public.role_permissions (role_name, permission_key, allowed)
select
  'caller',
  permission_key,
  case
    when permission_key in (
      'contacts_view',
      'contacts_create',
      'contacts_edit',
      'contacts_delete',
      'polls_view',
      'alexandra_use',
      'retell_call',
      'whatsapp_send'
    ) then true
    else false
  end
from
  keys
on conflict (role_name, permission_key) do update
set
  allowed = excluded.allowed;
