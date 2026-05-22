-- Merge legacy request status into Σε εξέλιξη (run in Supabase SQL Editor if not applied via CLI):
-- UPDATE requests SET status = 'Σε εξέλιξη' WHERE status = 'Σε αναμονή';

UPDATE requests SET status = 'Σε εξέλιξη' WHERE status = 'Σε αναμονή';
