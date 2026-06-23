-- Event management — archive flag for soft-delete
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;
