-- Permission: delete contact communication log entries (admin only by default).

with keys as (
  select unnest(array['communication_logs_delete']) as permission_key
)
insert into public.role_permissions (role_name, permission_key, allowed)
select 'admin', permission_key, true
from keys
on conflict (role_name, permission_key) do nothing;

with keys as (
  select unnest(array['communication_logs_delete']) as permission_key
)
insert into public.role_permissions (role_name, permission_key, allowed)
select 'manager', permission_key, false
from keys
on conflict (role_name, permission_key) do nothing;

with keys as (
  select unnest(array['communication_logs_delete']) as permission_key
)
insert into public.role_permissions (role_name, permission_key, allowed)
select 'caller', permission_key, false
from keys
on conflict (role_name, permission_key) do nothing;
