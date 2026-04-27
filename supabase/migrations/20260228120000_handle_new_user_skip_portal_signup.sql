-- Portal signups set app_metadata.portal_signup; register API upserts profiles (is_portal = true).
-- Do not auto-insert a default CRM profile for those users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.raw_app_meta_data->>'portal_signup', 'false') = 'true' then
    return new;
  end if;
  if coalesce(new.raw_user_meta_data->>'portal_signup', 'false') = 'true' then
    return new;
  end if;
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'caller'
  );
  return new;
end;
$$;
