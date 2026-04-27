-- Portal social embeds (TikTok, Facebook iframes) + visibility toggles
create table if not exists public.portal_social_settings (
  id int primary key check (id = 1) default 1,
  show_tiktok boolean not null default true,
  show_facebook boolean not null default true,
  show_instagram boolean not null default true,
  instagram_follower_label text,
  updated_at timestamptz not null default now()
);

alter table public.portal_social_settings
  add column if not exists instagram_follower_label text;

insert into public.portal_social_settings (id, show_tiktok, show_facebook, show_instagram, instagram_follower_label)
values (1, true, true, true, null)
on conflict (id) do nothing;

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  url text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_social_posts_platform on public.social_posts (platform, sort_order);

alter table public.portal_social_settings enable row level security;
alter table public.social_posts enable row level security;

drop policy if exists "portal_social_settings public read" on public.portal_social_settings;
create policy "portal_social_settings public read"
  on public.portal_social_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "social_posts public read" on public.social_posts;
create policy "social_posts public read"
  on public.social_posts for select
  to anon, authenticated
  using (active = true);

drop policy if exists "portal_social_settings crm write" on public.portal_social_settings;
create policy "portal_social_settings crm write"
  on public.portal_social_settings for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_portal, false) = false
        and p.role in ('admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_portal, false) = false
        and p.role in ('admin', 'manager')
    )
  );

drop policy if exists "social_posts crm write" on public.social_posts;
create policy "social_posts crm write"
  on public.social_posts for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_portal, false) = false
        and p.role in ('admin', 'manager')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_portal, false) = false
        and p.role in ('admin', 'manager')
    )
  );

-- Initial seed (runs only when table is empty; replace TikTok video URLs in CRM with real IDs)
insert into public.social_posts (platform, url, sort_order)
select v.platform, v.url, v.ord
from (values
  ('tiktok'::text, 'https://www.tiktok.com/@kostas.karagounis/video/7312345678901234567', 0),
  ('tiktok', 'https://www.tiktok.com/@kostas.karagounis/video/7313456789012345678', 1),
  ('tiktok', 'https://www.tiktok.com/@kostas.karagounis/video/7314567890123456789', 2),
  ('facebook', 'https://www.facebook.com/share/1J746vaYai/', 0),
  ('facebook', 'https://www.facebook.com/share/1J746vaYai/', 1),
  ('facebook', 'https://www.facebook.com/share/1J746vaYai/', 2)
) as v(platform, url, ord)
where not exists (select 1 from public.social_posts limit 1);
