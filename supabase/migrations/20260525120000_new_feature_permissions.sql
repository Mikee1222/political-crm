-- New permission keys for scheduler, data tools, access code, request actions.

with keys as (
  select unnest(
    array[
      'contacts_bulk',
      'requests_complete',
      'requests_reject',
      'requests_assign',
      'requests_scheduler_view',
      'requests_scheduler_schedule',
      'requests_scheduler_complete',
      'requests_scheduler_reject',
      'requests_scheduler_ai_summary',
      'data_tools_view',
      'data_tools_bulk_delete',
      'data_tools_bulk_edit',
      'data_tools_export_vcf',
      'data_tools_export_excel',
      'access_code_view',
      'access_code_revoke'
    ]
  ) as permission_key
)
insert into public.role_permissions (role_name, permission_key, allowed)
select 'admin', permission_key, true
from keys
on conflict (role_name, permission_key) do nothing;

with keys as (
  select unnest(
    array[
      'contacts_bulk',
      'requests_complete',
      'requests_reject',
      'requests_assign',
      'requests_scheduler_view',
      'requests_scheduler_schedule',
      'requests_scheduler_complete',
      'requests_scheduler_reject',
      'requests_scheduler_ai_summary',
      'data_tools_view',
      'data_tools_bulk_delete',
      'data_tools_bulk_edit',
      'data_tools_export_vcf',
      'data_tools_export_excel',
      'access_code_view',
      'access_code_revoke'
    ]
  ) as permission_key
)
insert into public.role_permissions (role_name, permission_key, allowed)
select
  'manager',
  permission_key,
  case
    when permission_key in (
      'data_tools_bulk_delete',
      'access_code_view',
      'access_code_revoke'
    ) then false
    else true
  end
from keys
on conflict (role_name, permission_key) do nothing;

with keys as (
  select unnest(
    array[
      'contacts_bulk',
      'requests_complete',
      'requests_reject',
      'requests_assign',
      'requests_scheduler_view',
      'requests_scheduler_schedule',
      'requests_scheduler_complete',
      'requests_scheduler_reject',
      'requests_scheduler_ai_summary',
      'data_tools_view',
      'data_tools_bulk_delete',
      'data_tools_bulk_edit',
      'data_tools_export_vcf',
      'data_tools_export_excel',
      'access_code_view',
      'access_code_revoke'
    ]
  ) as permission_key
)
insert into public.role_permissions (role_name, permission_key, allowed)
select
  'caller',
  permission_key,
  case
    when permission_key in ('requests_scheduler_view', 'requests_scheduler_ai_summary') then true
    else false
  end
from keys
on conflict (role_name, permission_key) do nothing;

-- Ensure analytics_view stays enabled for callers (may already exist)
insert into public.role_permissions (role_name, permission_key, allowed)
values ('caller', 'analytics_view', true)
on conflict (role_name, permission_key) do update
set allowed = true
where role_permissions.role_name = 'caller'
  and role_permissions.permission_key = 'analytics_view';
