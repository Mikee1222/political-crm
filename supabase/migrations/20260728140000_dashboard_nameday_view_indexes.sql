-- Dashboard load indexes (namedays + recently-viewed).
--
-- Schema notes (Karagkounis / viibonjvztoczcrftdea):
--   * Calendar table is public.name_days (not namedays).
--   * name_days already has UNIQUE (month, day) via name_days_month_day_uniq —
--     idx_namedays_month_day is an explicit lookup alias (IF NOT EXISTS).
--   * idx_contact_views_user_viewed / idx_request_views_user_viewed already exist
--     from 20260630120000_dashboard_view_tracking.sql — re-stated IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS idx_namedays_month_day ON public.name_days (month, day);

CREATE INDEX IF NOT EXISTS idx_contact_views_user_viewed
  ON public.contact_views (user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_request_views_user_viewed
  ON public.request_views (user_id, viewed_at DESC);
