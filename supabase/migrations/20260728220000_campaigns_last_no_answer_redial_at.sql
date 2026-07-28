-- Persist last «Επανεκκίνηση Δεν Απάντησε» trigger time per campaign
alter table public.campaigns
  add column if not exists last_no_answer_redial_at timestamptz;
