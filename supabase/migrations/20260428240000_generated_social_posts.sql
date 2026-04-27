-- CRM-generated social copy (AI), distinct from portal social_posts URLs
create table if not exists public.generated_social_posts (
  id uuid primary key default gen_random_uuid (),
  platform text,
  topic text,
  content text not null,
  created_at timestamptz not null default now (),
  user_id uuid references auth.users (id) on delete set null
);

create index if not exists idx_generated_social_posts_created on public.generated_social_posts (created_at desc);

alter table public.generated_social_posts enable row level security;

drop policy if exists "generated_social_posts all" on public.generated_social_posts;
create policy "generated_social_posts all" on public.generated_social_posts for all to authenticated using (true) with check (true);
