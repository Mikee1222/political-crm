-- When no Facebook rows exist, seed three public post/share URLs for fb-post embeds.
insert into public.social_posts (platform, url, sort_order, active)
select v.platform, v.url, v.ord, true
from (values
  ('facebook'::text, 'https://www.facebook.com/share/1J746vaYai/', 0),
  ('facebook', 'https://www.facebook.com/share/1J746vaYai/', 1),
  ('facebook', 'https://www.facebook.com/share/1J746vaYai/', 2)
) as v(platform, url, ord)
where not exists (select 1 from public.social_posts s where s.platform = 'facebook');
