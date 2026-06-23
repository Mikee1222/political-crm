-- Group + name contact search server-side (avoids fetching tens of thousands of IDs in batches).

create or replace function public.search_contacts_in_groups(
  p_group_ids uuid[],
  p_first_name text default null,
  p_last_name text default null,
  p_match_mode text default 'or'
)
returns table (
  id uuid,
  first_name text,
  last_name text,
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
  predicted_score numeric,
  is_volunteer boolean,
  volunteer_role text,
  volunteer_area text,
  volunteer_since date,
  language text,
  last_contacted_at timestamptz,
  father_name text,
  name_day text,
  is_dead boolean,
  electoral_district text,
  may_not_have_mobile boolean,
  may_not_have_landline boolean,
  may_not_have_email boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with membership as (
    select cgm.contact_id, cgm.group_id
    from contact_group_members cgm
    where cgm.group_id = any (p_group_ids)
    union
    select c.id as contact_id, c.group_id
    from contacts c
    where c.group_id = any (p_group_ids)
  ),
  grouped as (
    select
      membership.contact_id,
      count(distinct membership.group_id) as group_hits
    from membership
    group by membership.contact_id
  ),
  need as (
    select coalesce(array_length(p_group_ids, 1), 0) as n
  ),
  matched_ids as (
    select grouped.contact_id
    from grouped, need
    where need.n > 0
      and (
        (coalesce(lower(trim(p_match_mode)), 'or') = 'and' and grouped.group_hits = need.n)
        or (coalesce(lower(trim(p_match_mode)), 'or') <> 'and' and grouped.group_hits >= 1)
      )
  )
  select
    c.id,
    c.first_name,
    c.last_name,
    c.phone,
    c.phone2,
    c.landline,
    c.email,
    c.area,
    c.municipality,
    c.toponym,
    c.gender,
    c.call_status,
    c.priority,
    c.tags,
    c.nickname,
    c.contact_code,
    c.age,
    c.political_stance,
    c.group_id,
    c.birthday,
    c.predicted_score,
    c.is_volunteer,
    c.volunteer_role,
    c.volunteer_area,
    c.volunteer_since,
    c.language,
    c.last_contacted_at,
    c.father_name,
    c.name_day,
    c.is_dead,
    c.electoral_district,
    c.may_not_have_mobile,
    c.may_not_have_landline,
    c.may_not_have_email,
    c.created_at
  from contacts c
  inner join matched_ids m on m.contact_id = c.id
  where (
      p_first_name is null
      or trim(p_first_name) = ''
      or c.first_name ilike '%' || trim(p_first_name) || '%'
    )
    and (
      p_last_name is null
      or trim(p_last_name) = ''
      or c.last_name ilike '%' || trim(p_last_name) || '%'
    )
  order by c.created_at desc;
$$;

grant execute on function public.search_contacts_in_groups(uuid[], text, text, text) to authenticated;
