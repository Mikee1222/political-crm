-- Expanded analytics RPCs (Karagkounis / full CRM dashboard).
-- Positive/negative/deceased/no-number metrics use contact_group_members
-- with accent-insensitive exact group name matching.

drop function if exists public.get_municipality_positive_breakdown();
drop function if exists public.get_age_group_distribution();
drop function if exists public.get_requests_by_month(int);
drop function if exists public.get_requests_by_assignee();
drop function if exists public.get_requests_by_status();
drop function if exists public.get_requests_by_source();
drop function if exists public.get_calls_by_user();
drop function if exists public.get_calls_by_outcome();
drop function if exists public.get_top_groups(int);
drop function if exists public.get_full_municipality_breakdown();
drop function if exists public.get_weekly_activity_timeline(int);
drop function if exists public.get_positive_members_by_month(int);
drop function if exists public.get_analytics_group_kpis();
drop function if exists public.analytics_group_id_by_name(text);
drop function if exists public.analytics_greek_upper(text);

create or replace function public.analytics_greek_upper(t text)
returns text
language sql
immutable
as $$
  select translate(
    upper(btrim(coalesce(t, ''))),
    'ΆΈΉΊΌΎΏΪΫάέήίόύώϊϋΐΰ',
    'ΑΕΗΙΟΥΩΙΥΑΕΗΙΟΥΩΙΥΙΥ'
  );
$$;

create or replace function public.analytics_group_id_by_name(p_name text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select cg.id
  from contact_groups cg
  where public.analytics_greek_upper(cg.name) = public.analytics_greek_upper(p_name)
  order by cg.name
  limit 1;
$$;

-- Finer age buckets for analytics page
create or replace function public.get_age_group_distribution()
returns table(age_group text, count bigint)
language sql
security definer
set search_path = public
as $$
  with buckets as (
    select
      case
        when age is null then 'Άγνωστο'
        when age < 18 then '<18'
        when age <= 25 then '18-25'
        when age <= 35 then '26-35'
        when age <= 45 then '36-45'
        when age <= 55 then '46-55'
        when age <= 65 then '56-65'
        when age <= 75 then '66-75'
        else '75+'
      end as age_group
    from contacts
  )
  select
    age_group,
    count(*)::bigint as count
  from buckets
  group by age_group
  order by
    case age_group
      when '<18' then 0
      when '18-25' then 1
      when '26-35' then 2
      when '36-45' then 3
      when '46-55' then 4
      when '56-65' then 5
      when '66-75' then 6
      when '75+' then 7
      else 8
    end;
$$;

-- Top municipalities still useful for chart; full table uses get_full_municipality_breakdown
create or replace function public.get_municipality_positive_breakdown()
returns table(municipality text, total bigint, positive bigint)
language sql
security definer
set search_path = public
as $$
  with pos as (
    select public.analytics_group_id_by_name('ΘΕΤΙΚΟΣ') as id
  )
  select
    coalesce(nullif(btrim(c.municipality), ''), 'Άνευ δήμου') as municipality,
    count(*)::bigint as total,
    count(*) filter (
      where exists (
        select 1 from contact_group_members cgm
        where cgm.contact_id = c.id and cgm.group_id = (select id from pos)
      )
    )::bigint as positive
  from contacts c
  group by 1
  having count(*) >= 2
    and count(*) filter (
      where exists (
        select 1 from contact_group_members cgm
        where cgm.contact_id = c.id and cgm.group_id = (select id from pos)
      )
    ) > 0
  order by (
    count(*) filter (
      where exists (
        select 1 from contact_group_members cgm
        where cgm.contact_id = c.id and cgm.group_id = (select id from pos)
      )
    )::float / nullif(count(*), 0)
  ) desc
  limit 12;
$$;

create or replace function public.get_requests_by_month(p_months int default 12)
returns table(month_start date, count bigint)
language sql
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', (now() at time zone 'Europe/Athens'))::date
      - ((greatest(coalesce(p_months, 12), 1) - 1) || ' months')::interval as since_month
  )
  select
    date_trunc('month', r.created_at)::date as month_start,
    count(*)::bigint as count
  from requests r, bounds b
  where r.created_at >= b.since_month
  group by 1
  order by 1;
$$;

create or replace function public.get_requests_by_assignee()
returns table(assignee text, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(nullif(btrim(assigned_to), ''), 'Χωρίς χειριστή') as assignee,
    count(*)::bigint as count
  from requests
  group by 1
  order by count desc
  limit 40;
$$;

create or replace function public.get_requests_by_status()
returns table(status text, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(nullif(btrim(status), ''), 'Ανοικτό') as status,
    count(*)::bigint as count
  from requests
  group by 1
  order by count desc;
$$;

create or replace function public.get_requests_by_source()
returns table(source text, count bigint)
language sql
security definer
set search_path = public
as $$
  -- requests has no source column; attribute via linked contact.source
  select
    coalesce(nullif(btrim(c.source), ''), 'Άγνωστη πηγή') as source,
    count(*)::bigint as count
  from requests r
  left join contacts c on c.id = r.contact_id
  group by 1
  order by count desc
  limit 30;
$$;

create or replace function public.get_calls_by_user()
returns table(user_label text, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(
      nullif(btrim(p.full_name), ''),
      nullif(btrim(cl.marked_by_name), ''),
      cl.marked_by_user_id::text,
      'Άγνωστος'
    ) as user_label,
    count(*)::bigint as count
  from calls cl
  left join profiles p on p.id = cl.marked_by_user_id
  group by 1
  order by count desc
  limit 40;
$$;

create or replace function public.get_calls_by_outcome()
returns table(outcome text, count bigint)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(nullif(btrim(outcome), ''), 'Χωρίς αποτέλεσμα') as outcome,
    count(*)::bigint as count
  from calls
  group by 1
  order by count desc;
$$;

create or replace function public.get_top_groups(p_limit int default 10)
returns table(group_name text, color text, count bigint)
language sql
security definer
set search_path = public
as $$
  select cg.name as group_name, cg.color, count(cgm.contact_id)::bigint as count
  from contact_groups cg
  left join contact_group_members cgm on cgm.group_id = cg.id
  group by cg.id, cg.name, cg.color
  order by count desc
  limit greatest(coalesce(p_limit, 10), 1);
$$;

create or replace function public.get_full_municipality_breakdown()
returns table(
  municipality text,
  total bigint,
  positive bigint,
  negative bigint,
  deceased bigint,
  requests bigint,
  positive_pct numeric
)
language sql
security definer
set search_path = public
as $$
  with ids as (
    select
      public.analytics_group_id_by_name('ΘΕΤΙΚΟΣ') as positive_id,
      public.analytics_group_id_by_name('ΑΡΝΗΤΙΚΟΣ') as negative_id,
      public.analytics_group_id_by_name('ΑΠΕΒΙΩΣΕ') as deceased_id
  ),
  flagged as (
    select
      c.id,
      coalesce(nullif(btrim(c.municipality), ''), 'Άνευ δήμου') as municipality,
      bool_or(cgm.group_id = i.positive_id) as is_positive,
      bool_or(cgm.group_id = i.negative_id) as is_negative,
      bool_or(cgm.group_id = i.deceased_id) as is_deceased
    from contacts c
    cross join ids i
    left join contact_group_members cgm on cgm.contact_id = c.id
    group by c.id, coalesce(nullif(btrim(c.municipality), ''), 'Άνευ δήμου')
  ),
  muni as (
    select
      municipality,
      count(*)::bigint as total,
      count(*) filter (where is_positive)::bigint as positive,
      count(*) filter (where is_negative)::bigint as negative,
      count(*) filter (where is_deceased)::bigint as deceased
    from flagged
    group by municipality
  ),
  req as (
    select
      coalesce(nullif(btrim(c.municipality), ''), 'Άνευ δήμου') as municipality,
      count(*)::bigint as requests
    from requests r
    join contacts c on c.id = r.contact_id
    group by 1
  )
  select
    m.municipality,
    m.total,
    m.positive,
    m.negative,
    m.deceased,
    coalesce(r.requests, 0)::bigint as requests,
    case when m.total > 0
      then round((m.positive::numeric / m.total::numeric) * 1000) / 10
      else 0
    end as positive_pct
  from muni m
  left join req r on r.municipality = m.municipality
  order by m.total desc, m.municipality;
$$;

create or replace function public.get_weekly_activity_timeline(p_weeks int default 26)
returns table(week_start date, contacts bigint, requests bigint, calls bigint)
language sql
security definer
set search_path = public
as $$
  with weeks as (
    select generate_series(
      date_trunc('week', (now() at time zone 'Europe/Athens')::timestamp)
        - ((greatest(coalesce(p_weeks, 26), 1) - 1) || ' weeks')::interval,
      date_trunc('week', (now() at time zone 'Europe/Athens')::timestamp),
      interval '1 week'
    )::date as week_start
  ),
  c_agg as (
    select date_trunc('week', created_at)::date as week_start, count(*)::bigint as n
    from contacts
    where created_at >= (select min(week_start) from weeks)
    group by 1
  ),
  r_agg as (
    select date_trunc('week', created_at)::date as week_start, count(*)::bigint as n
    from requests
    where created_at >= (select min(week_start) from weeks)
    group by 1
  ),
  cl_agg as (
    select date_trunc('week', called_at)::date as week_start, count(*)::bigint as n
    from calls
    where called_at is not null
      and called_at >= (select min(week_start) from weeks)
    group by 1
  )
  select
    w.week_start,
    coalesce(c.n, 0)::bigint as contacts,
    coalesce(r.n, 0)::bigint as requests,
    coalesce(cl.n, 0)::bigint as calls
  from weeks w
  left join c_agg c on c.week_start = w.week_start
  left join r_agg r on r.week_start = w.week_start
  left join cl_agg cl on cl.week_start = w.week_start
  order by w.week_start;
$$;

-- Cumulative Θετικοί memberships by month (best available: contact_group_members.created_at)
create or replace function public.get_positive_members_by_month(p_months int default 12)
returns table(month_start date, new_members bigint, cumulative bigint)
language sql
security definer
set search_path = public
as $$
  with pos as (
    select public.analytics_group_id_by_name('ΘΕΤΙΚΟΣ') as id
  ),
  months as (
    select generate_series(
      date_trunc('month', (now() at time zone 'Europe/Athens')::timestamp)
        - ((greatest(coalesce(p_months, 12), 1) - 1) || ' months')::interval,
      date_trunc('month', (now() at time zone 'Europe/Athens')::timestamp),
      interval '1 month'
    )::date as month_start
  ),
  joined as (
    select date_trunc('month', cgm.created_at)::date as month_start, count(*)::bigint as n
    from contact_group_members cgm, pos
    where cgm.group_id = pos.id
      and cgm.created_at >= (select min(month_start) from months)
    group by 1
  ),
  prior as (
    select count(*)::bigint as n
    from contact_group_members cgm, pos
    where cgm.group_id = pos.id
      and cgm.created_at < (select min(month_start) from months)
  )
  select
    m.month_start,
    coalesce(j.n, 0)::bigint as new_members,
    (
      (select n from prior)
      + sum(coalesce(j.n, 0)) over (order by m.month_start rows unbounded preceding)
    )::bigint as cumulative
  from months m
  left join joined j on j.month_start = m.month_start
  order by m.month_start;
$$;

create or replace function public.get_analytics_group_kpis()
returns table(
  positive_count bigint,
  deceased_count bigint,
  no_number_count bigint,
  negative_count bigint,
  no_phone_count bigint
)
language sql
security definer
set search_path = public
as $$
  with ids as (
    select
      public.analytics_group_id_by_name('ΘΕΤΙΚΟΣ') as positive_id,
      public.analytics_group_id_by_name('ΑΠΕΒΙΩΣΕ') as deceased_id,
      public.analytics_group_id_by_name('ΧΩΡΙΣ ΑΡΙΘΜΟ') as no_number_id,
      public.analytics_group_id_by_name('ΑΡΝΗΤΙΚΟΣ') as negative_id
  )
  select
    (select count(*)::bigint from contact_group_members cgm, ids where cgm.group_id = ids.positive_id),
    (select count(*)::bigint from contact_group_members cgm, ids where cgm.group_id = ids.deceased_id),
    (select count(*)::bigint from contact_group_members cgm, ids where cgm.group_id = ids.no_number_id),
    (select count(*)::bigint from contact_group_members cgm, ids where cgm.group_id = ids.negative_id),
    (
      select count(*)::bigint from contacts c
      where nullif(btrim(coalesce(c.phone, '')), '') is null
        and nullif(btrim(coalesce(c.phone2, '')), '') is null
        and nullif(btrim(coalesce(c.landline, '')), '') is null
    );
$$;

grant execute on function public.analytics_greek_upper(text) to authenticated;
grant execute on function public.analytics_group_id_by_name(text) to authenticated;
grant execute on function public.get_age_group_distribution() to authenticated;
grant execute on function public.get_municipality_positive_breakdown() to authenticated;
grant execute on function public.get_requests_by_month(int) to authenticated;
grant execute on function public.get_requests_by_assignee() to authenticated;
grant execute on function public.get_requests_by_status() to authenticated;
grant execute on function public.get_requests_by_source() to authenticated;
grant execute on function public.get_calls_by_user() to authenticated;
grant execute on function public.get_calls_by_outcome() to authenticated;
grant execute on function public.get_top_groups(int) to authenticated;
grant execute on function public.get_full_municipality_breakdown() to authenticated;
grant execute on function public.get_weekly_activity_timeline(int) to authenticated;
grant execute on function public.get_positive_members_by_month(int) to authenticated;
grant execute on function public.get_analytics_group_kpis() to authenticated;
