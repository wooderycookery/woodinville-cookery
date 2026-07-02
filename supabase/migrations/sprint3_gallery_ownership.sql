-- Sprint 3 — Gallery photo ownership columns
-- author_name: display name stored at upload time (may already exist from prior migration)
-- author_token: guest invite_token stored for ownership verification; never returned to clients
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS author_name  text,
  ADD COLUMN IF NOT EXISTS author_token text;
