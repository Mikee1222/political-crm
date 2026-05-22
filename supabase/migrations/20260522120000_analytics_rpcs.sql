-- Analytics aggregations (full-table GROUP BY; avoids PostgREST 1000-row cap)

create or replace function public.get_municipality_contact_counts()
returns table(municipality text, count bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(toponym, 'Άνευ δήμου') as municipality, count(*)::bigint as count
  from contacts
  group by coalesce(toponym, 'Άνευ δήμου')
  order by count desc
  limit 15;
$$;

create or replace function public.get_call_status_distribution()
returns table(call_status text, count bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(call_status, 'Χωρίς κατάσταση') as call_status, count(*)::bigint as count
  from contacts
  group by call_status
  order by count desc;
$$;

create or replace function public.get_group_distribution()
returns table(group_name text, color text, count bigint)
language sql
security definer
set search_path = public
as $$
  select cg.name as group_name, cg.color, count(c.id)::bigint as count
  from contact_groups cg
  left join contacts c on c.group_id = cg.id
  group by cg.id, cg.name, cg.color
  order by count desc;
$$;

create or replace function public.get_age_group_distribution()
returns table(age_group text, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    case
      when age is null then 'Άγνωστο'
      when age < 30 then '<30'
      when age <= 45 then '30–45'
      when age <= 60 then '45–60'
      else '60+'
    end as age_group,
    count(*)::bigint as count
  from contacts
  group by 1
  order by 1;
$$;

create or replace function public.get_municipality_positive_breakdown()
returns table(municipality text, total bigint, positive bigint)
language sql
security definer
set search_path = public
as $$
  with pos as (
    select id from contact_groups where name ilike 'ΘΕΤΙΚΟΣ%' limit 1
  )
  select
    coalesce(c.municipality, 'Άνευ δήμου') as municipality,
    count(*)::bigint as total,
    count(*) filter (where c.group_id = (select id from pos))::bigint as positive
  from contacts c
  group by coalesce(c.municipality, 'Άνευ δήμου')
  having count(*) >= 2
    and count(*) filter (where c.group_id = (select id from pos)) > 0
  order by (count(*) filter (where c.group_id = (select id from pos))::float / nullif(count(*), 0)) desc
  limit 12;
$$;

create or replace function public.get_contacts_created_weekly_counts(since_ts timestamptz)
returns table(week_start date, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    date_trunc('week', created_at)::date as week_start,
    count(*)::bigint as count
  from contacts
  where created_at >= since_ts
  group by 1
  order by 1;
$$;

grant execute on function public.get_municipality_contact_counts() to authenticated;
grant execute on function public.get_call_status_distribution() to authenticated;
grant execute on function public.get_group_distribution() to authenticated;
grant execute on function public.get_age_group_distribution() to authenticated;
grant execute on function public.get_municipality_positive_breakdown() to authenticated;
grant execute on function public.get_contacts_created_weekly_counts(timestamptz) to authenticated;
