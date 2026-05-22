-- Migration note (run in Supabase SQL editor if not applied via CLI):
-- ALTER TABLE requests ADD COLUMN IF NOT EXISTS scheduled_date date;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS scheduled_date date;
CREATE INDEX IF NOT EXISTS idx_requests_scheduled_date ON requests(scheduled_date);
