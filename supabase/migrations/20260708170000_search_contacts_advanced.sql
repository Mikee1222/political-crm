-- Unified server-side contacts search: name + groups + common column filters.
-- Filters entirely in Postgres (EXISTS on contact_group_members) so large groups
-- never need to be materialized in Node.

create extension if not exists pg_trgm;

-- Accent-insensitive helpers (idempotent; may already exist from prior migrations).
create or replace function public.normalize_greek_contact_name(t text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(
    replace(
      replace(
        translate(
          coalesce(t, ''),
          'ΆΈΉΊΌΎΏΪΫάέήίόύώϊΐΰὰὲὴὶὸὺὼᾶῆῖῦῶ',
          'ΑΕΗΙΟΥΩΙΥαεηιουωιυαεηιουωαηιυω'
        ),
        'ς',
        'σ'
      ),
      'Σ',
      'σ'
    )
  );
$$;

create or replace function public.contact_name_field_matches(p_field text, p_query text)
returns boolean
language sql
immutable
parallel safe
as $$
  select
    p_query is null
    or trim(p_query) = ''
    or (
      coalesce(p_field, '') <> ''
      and public.normalize_greek_contact_name(p_field) like
        '%' || public.normalize_greek_contact_name(trim(p_query)) || '%'
    );
$$;

grant execute on function public.normalize_greek_contact_name(text) to authenticated, service_role;
grant execute on function public.contact_name_field_matches(text, text) to authenticated, service_role;

create index if not exists idx_contacts_father_name_trgm
  on public.contacts using gin (father_name gin_trgm_ops);

create index if not exists idx_contacts_gender
  on public.contacts using btree (gender);

create index if not exists idx_contacts_call_status
  on public.contacts using btree (call_status);

create index if not exists idx_contacts_political_stance
  on public.contacts using btree (political_stance);

create index if not exists idx_contacts_toponym
  on public.contacts using btree (toponym);

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
  p_limit int default 50
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
      end as toponyms
  ),
  filtered as (
    select c.*
    from contacts c
    cross join params p
    where
      -- Names (accent-insensitive; first_name also matches nickname)
      (
        p.first_name is null
        or public.contact_name_field_matches(c.first_name, p.first_name)
        or public.contact_name_field_matches(c.nickname, p.first_name)
      )
      and (
        p.last_name is null
        or public.contact_name_field_matches(c.last_name, p.last_name)
      )
      and (
        p.father_name is null
        or public.contact_name_field_matches(c.father_name, p.father_name)
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
      -- Include groups
      and (
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
      -- Exclude groups
      and (
        p.exclude_ids is null
        or cardinality(p.exclude_ids) = 0
        or not (
          exists (
            select 1
            from contact_group_members cgm
            where cgm.contact_id = c.id
              and cgm.group_id = any (p.exclude_ids)
          )
          or c.group_id = any (p.exclude_ids)
        )
      )
  )
  select
    f.id,
    f.first_name,
    f.last_name,
    f.father_name,
    f.phone,
    f.phone2,
    f.landline,
    f.email,
    f.area,
    f.municipality,
    f.toponym,
    f.gender,
    f.call_status,
    f.priority,
    f.tags,
    f.nickname,
    f.contact_code,
    f.age,
    f.political_stance,
    f.group_id,
    f.birthday,
    extract(year from f.birthday)::int as birth_year,
    f.predicted_score::numeric,
    f.is_volunteer,
    f.volunteer_role,
    f.volunteer_area,
    f.volunteer_since,
    f.language,
    f.last_contacted_at,
    f.name_day::text,
    f.is_dead,
    f.electoral_district,
    f.may_not_have_mobile,
    f.may_not_have_landline,
    f.may_not_have_email,
    f.created_at,
    count(*) over () as total_count
  from filtered f
  order by f.last_name asc nulls last, f.first_name asc nulls last, f.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.search_contacts_advanced(
  text, text, text, text, uuid[], uuid[], text, text[], text[], text, text, boolean, boolean, int, int
) to authenticated, service_role;
