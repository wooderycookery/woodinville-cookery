-- Sprint 3 — Guest list reveal date
-- Allows the host to set a date on/after which RSVPed guests can see
-- first names of attending guests. Before that date only the count is shown.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS guest_list_reveal_date date;
