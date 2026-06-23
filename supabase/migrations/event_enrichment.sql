-- Event enrichment — start time, end line, details, countdown fields
-- Note: end_time and location already exist from sprint3_goal1_schema.sql

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS start_time    timestamptz,
  ADD COLUMN IF NOT EXISTS all_day       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS multi_day_end date,
  ADD COLUMN IF NOT EXISTS end_line      text DEFAULT 'until the last bottle is empty',
  ADD COLUMN IF NOT EXISTS details       text;
