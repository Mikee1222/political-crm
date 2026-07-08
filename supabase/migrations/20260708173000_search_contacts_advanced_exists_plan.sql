-- Covering index for group membership lookups (index-only scans).
-- Rewrite search_contacts_advanced to use EXISTS instead of materializing
-- include_set CTEs so LIMIT 50 can stop early via last_name/first_name index.

create index if not exists idx_cgm_group_contact
  on public.contact_group_members (group_id, contact_id);

create or replace function public.count_contacts_in_groups_fast(
  p_group_ids uuid[],
  p_match_mode text default 'OR'
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      case
        when p_group_ids is null then null::uuid[]
        else array(select distinct x from unnest(p_group_ids) as x where x is not null)
      end as group_ids,
      case
        when coalesce(upper(trim(p_match_mode)), 'OR') = 'AND' then 'AND'
        else 'OR'
      end as match_mode
  )
  select coalesce(
    case
      when (select group_ids is null or cardinality(group_ids) = 0 from params) then 0::bigint
      when (select match_mode from params) = 'AND' then (
        select count(*)::bigint
        from (
          select m.contact_id
          from (
            select cgm.contact_id, cgm.group_id
            from contact_group_members cgm
            cross join params p
            where cgm.group_id = any (p.group_ids)
            union
            select c.id as contact_id, c.group_id
            from contacts c
            cross join params p
            where c.group_id = any (p.group_ids)
          ) m
          group by m.contact_id
          having count(distinct m.group_id) = (select cardinality(group_ids) from params)
        ) sub
      )
      else (
        select count(*)::bigint
        from (
          select cgm.contact_id
          from contact_group_members cgm
          cross join params p
          where cgm.group_id = any (p.group_ids)
          union
          select c.id
          from contacts c
          cross join params p
          where c.group_id = any (p.group_ids)
        ) u
      )
    end,
    0::bigint
  );
$$;

create or replace function public.search_contacts_advanced(
  p_first_name text default null,
  p_last_name text default null,
  p_father_name text default null,
  p_gender text default null,
  p_include_group_ids uuid[] default null,
  p_exclude_group_ids uuid[] default null,
  p_group_match_mode text default 'OR',
  p_municipalities text[] default null,
  p_toponyms text[] default null,
  p_call_status text default null,
  p_political_stance text default null,
  p_has_phone boolean default null,
  p_has_email boolean default null,
  p_offset int default 0,
  p_limit int default 50,
  p_compute_total boolean default true
)
returns table (
  id uuid,
  first_name text,
  last_name text,
  father_name text,
  phone text,
  phone2 text,
  landline text,
  email text,
  area text,
  municipality text,
  toponym text,
  gender text,
  call_status text,
  priority text,
  tags text[],
  nickname text,
  contact_code text,
  age integer,
  political_stance text,
  group_id uuid,
  birthday date,
  birth_year int,
  predicted_score numeric,
  is_volunteer boolean,
  volunteer_role text,
  volunteer_area text,
  volunteer_since date,
  language text,
  last_contacted_at timestamptz,
  name_day text,
  is_dead boolean,
  electoral_district text,
  may_not_have_mobile boolean,
  may_not_have_landline boolean,
  may_not_have_email boolean,
  created_at timestamptz,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with params as (
    select
      nullif(trim(p_first_name), '') as first_name,
      nullif(trim(p_last_name), '') as last_name,
      nullif(trim(p_father_name), '') as father_name,
      nullif(trim(p_gender), '') as gender,
      nullif(trim(p_call_status), '') as call_status,
      nullif(trim(p_political_stance), '') as political_stance,
      case
        when p_include_group_ids is null then null
        else array(select distinct x from unnest(p_include_group_ids) as x where x is not null)
      end as include_ids,
      case
        when p_exclude_group_ids is null then null
        else array(select distinct x from unnest(p_exclude_group_ids) as x where x is not null)
      end as exclude_ids,
      case
        when coalesce(upper(trim(p_group_match_mode)), 'OR') = 'AND' then 'AND'
        else 'OR'
      end as match_mode,
      case
        when p_municipalities is null then null
        else array(select distinct trim(x) from unnest(p_municipalities) as x where nullif(trim(x), '') is not null)
      end as municipalities,
      case
        when p_toponyms is null then null
        else array(select distinct trim(x) from unnest(p_toponyms) as x where nullif(trim(x), '') is not null)
      end as toponyms,
      public.normalize_greek_contact_name(nullif(trim(p_first_name), '')) as first_name_norm,
      public.normalize_greek_contact_name(nullif(trim(p_last_name), '')) as last_name_norm,
      public.normalize_greek_contact_name(nullif(trim(p_father_name), '')) as father_name_norm
  ),
  filter_flags as (
    select
      p.*,
      (
        p.include_ids is not null
        and cardinality(p.include_ids) > 0
        and p.first_name_norm is null
        and p.last_name_norm is null
        and p.father_name_norm is null
        and p.gender is null
        and p.call_status is null
        and p.political_stance is null
        and (p.municipalities is null or cardinality(p.municipalities) = 0)
        and (p.toponyms is null or cardinality(p.toponyms) = 0)
        and p_has_phone is null
        and p_has_email is null
        and (p.exclude_ids is null or cardinality(p.exclude_ids) = 0)
      ) as is_group_only
    from params p
  ),
  filtered as (
    select c.*
    from contacts c
    cross join filter_flags p
    where
      (
        p.include_ids is null
        or cardinality(p.include_ids) = 0
        or (
          p.match_mode = 'OR'
          and (
            exists (
              select 1
              from contact_group_members cgm
              where cgm.contact_id = c.id
                and cgm.group_id = any (p.include_ids)
            )
            or c.group_id = any (p.include_ids)
          )
        )
        or (
          p.match_mode = 'AND'
          and (
            select bool_and(
              exists (
                select 1
                from contact_group_members cgm
                where cgm.contact_id = c.id
                  and cgm.group_id = g.gid
              )
              or c.group_id = g.gid
            )
            from unnest(p.include_ids) as g(gid)
          )
        )
      )
      and (
        p.first_name_norm is null
        or public.normalize_greek_contact_name(c.first_name) like ('%' || p.first_name_norm || '%')
        or public.normalize_greek_contact_name(c.nickname) like ('%' || p.first_name_norm || '%')
      )
      and (
        p.last_name_norm is null
        or public.normalize_greek_contact_name(c.last_name) like ('%' || p.last_name_norm || '%')
      )
      and (
        p.father_name_norm is null
        or public.normalize_greek_contact_name(c.father_name) like ('%' || p.father_name_norm || '%')
      )
      and (p.gender is null or c.gender = p.gender)
      and (p.call_status is null or c.call_status = p.call_status)
      and (p.political_stance is null or c.political_stance = p.political_stance)
      and (
        p.municipalities is null
        or cardinality(p.municipalities) = 0
        or c.municipality = any (p.municipalities)
      )
      and (
        p.toponyms is null
        or cardinality(p.toponyms) = 0
        or c.toponym = any (p.toponyms)
      )
      and (
        p_has_phone is null
        or (
          p_has_phone = true
          and (
            nullif(trim(coalesce(c.phone, '')), '') is not null
            or nullif(trim(coalesce(c.phone2, '')), '') is not null
          )
          and coalesce(c.may_not_have_mobile, false) is not true
        )
        or (
          p_has_phone = false
          and coalesce(c.may_not_have_mobile, false) is not true
          and nullif(trim(coalesce(c.phone, '')), '') is null
          and nullif(trim(coalesce(c.phone2, '')), '') is null
        )
      )
      and (
        p_has_email is null
        or (
          p_has_email = true
          and nullif(trim(coalesce(c.email, '')), '') is not null
          and coalesce(c.may_not_have_email, false) is not true
        )
        or (
          p_has_email = false
          and coalesce(c.may_not_have_email, false) is not true
          and nullif(trim(coalesce(c.email, '')), '') is null
        )
      )
      and (
        p.exclude_ids is null
        or cardinality(p.exclude_ids) = 0
        or not (
          exists (
            select 1 from contact_group_members cgm
            where cgm.contact_id = c.id and cgm.group_id = any (p.exclude_ids)
          )
          or c.group_id = any (p.exclude_ids)
        )
      )
  ),
  total as (
    select case
      when coalesce(p_compute_total, true) is not true then 0::bigint
      when (select is_group_only from filter_flags) then
        public.count_contacts_in_groups_fast(
          (select include_ids from filter_flags),
          (select match_mode from filter_flags)
        )
      else (select count(*)::bigint from filtered)
    end as total_count
  )
  select
    f.id, f.first_name, f.last_name, f.father_name, f.phone, f.phone2, f.landline, f.email,
    f.area, f.municipality, f.toponym, f.gender, f.call_status, f.priority, f.tags, f.nickname,
    f.contact_code, f.age, f.political_stance, f.group_id, f.birthday,
    extract(year from f.birthday)::int as birth_year, f.predicted_score::numeric, f.is_volunteer,
    f.volunteer_role, f.volunteer_area, f.volunteer_since, f.language, f.last_contacted_at,
    f.name_day::text, f.is_dead, f.electoral_district, f.may_not_have_mobile,
    f.may_not_have_landline, f.may_not_have_email, f.created_at,
    (select t.total_count from total t) as total_count
  from filtered f
  order by f.last_name asc nulls last, f.first_name asc nulls last, f.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.count_contacts_in_groups_fast(uuid[], text)
  to authenticated, service_role;

grant execute on function public.search_contacts_advanced(
  text, text, text, text, uuid[], uuid[], text, text[], text[], text, text, boolean, boolean, int, int, boolean
) to authenticated, service_role;
