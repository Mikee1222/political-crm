-- Allow anon/authenticated SELECT on all rows (API still filters active/tiktok in application layer when using service role).
drop policy if exists "social_posts public read" on public.social_posts;
drop policy if exists "social_posts_public_read" on public.social_posts;

create policy "social_posts_public_read"
  on public.social_posts for select
  to anon, authenticated
  using (true);
