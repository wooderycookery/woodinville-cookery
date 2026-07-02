-- Ensure messages table has author_name and author_role columns
-- (created in sprint3_goal1_schema.sql but author metadata was added via post-message.js)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS author_role text DEFAULT 'guest';
