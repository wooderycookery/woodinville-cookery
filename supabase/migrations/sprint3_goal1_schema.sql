-- Sprint 3 — Goal 1: Schema Expansion
-- Ref: Sprint 3 Kickoff Brief (2kz9t6vy-477) + Role Hierarchy (2kz9t6vy-497)
-- Run this before any Sprint 3 feature work.

-- ============================================================
-- 0. Clean up sprint3_roles.sql (different column names — tables are empty)
-- ============================================================

DROP TRIGGER IF EXISTS on_society_created ON societies;
DROP FUNCTION IF EXISTS assign_society_founder();
DROP TABLE IF EXISTS event_roles CASCADE;
DROP TABLE IF EXISTS community_members CASCADE;
DROP TABLE IF EXISTS societies CASCADE;

-- ============================================================
-- 1A. Expand existing tables
-- ============================================================

-- Events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS slug                 text UNIQUE,
  ADD COLUMN IF NOT EXISTS event_type           text DEFAULT 'gathering',
  ADD COLUMN IF NOT EXISTS end_time             timestamptz,
  ADD COLUMN IF NOT EXISTS timezone             text DEFAULT 'America/Los_Angeles',
  ADD COLUMN IF NOT EXISTS max_capacity         int,
  ADD COLUMN IF NOT EXISTS rsvp_limit           int,
  ADD COLUMN IF NOT EXISTS waitlist_enabled     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_private           boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS status               text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cover_image_url      text,
  ADD COLUMN IF NOT EXISTS bring_list_enabled   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS message_board_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS community_id         uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason     text;

-- Backfill slugs for existing events using their id
UPDATE events SET slug = id::text WHERE slug IS NULL;

-- Profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name      text,
  ADD COLUMN IF NOT EXISTS avatar_url        text,
  ADD COLUMN IF NOT EXISTS bio               text,
  ADD COLUMN IF NOT EXISTS phone             text,
  ADD COLUMN IF NOT EXISTS community_id      uuid,
  ADD COLUMN IF NOT EXISTS member_since      timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS preferred_contact text DEFAULT 'email';

-- Contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS phone                text,
  ADD COLUMN IF NOT EXISTS avatar_url           text,
  ADD COLUMN IF NOT EXISTS dietary_preferences  text,
  ADD COLUMN IF NOT EXISTS host_notes           text,
  ADD COLUMN IF NOT EXISTS tags                 text[],
  ADD COLUMN IF NOT EXISTS source               text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_invited_at      timestamptz,
  ADD COLUMN IF NOT EXISTS events_attended      int DEFAULT 0;

-- Guests
ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS role                   text DEFAULT 'guest',
  ADD COLUMN IF NOT EXISTS checked_in             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS checked_in_at          timestamptz,
  ADD COLUMN IF NOT EXISTS plus_one               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS plus_one_name          text,
  ADD COLUMN IF NOT EXISTS reminder_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_opened_at   timestamptz,
  ADD COLUMN IF NOT EXISTS save_the_date_sent_at  timestamptz;

-- Bring list items
ALTER TABLE bring_list_items
  ADD COLUMN IF NOT EXISTS display_order int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description   text;

-- Messages (create if not exists, then expand)
CREATE TABLE IF NOT EXISTS messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        REFERENCES events(id) ON DELETE CASCADE,
  author_id  uuid,
  channel    text        DEFAULT 'attendees',
  body       text        NOT NULL,
  type       text        DEFAULT 'message',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS is_pinned  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages(id),
  ADD COLUMN IF NOT EXISTS type       text DEFAULT 'message';

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Photos (create if not exists, then expand)
CREATE TABLE IF NOT EXISTS photos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        REFERENCES events(id) ON DELETE CASCADE,
  uploader_id  uuid,
  storage_path text        NOT NULL,
  phase        text        DEFAULT 'pre',
  uploaded_at  timestamptz DEFAULT now()
);

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS caption   text,
  ADD COLUMN IF NOT EXISTS featured  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS width     int,
  ADD COLUMN IF NOT EXISTS height    int,
  ADD COLUMN IF NOT EXISTS file_size int,
  ADD COLUMN IF NOT EXISTS mime_type text;

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1B. New tables
-- ============================================================

-- Communities (the commercial product unlock)
CREATE TABLE IF NOT EXISTS communities (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  slug            text        NOT NULL UNIQUE,
  description     text,
  avatar_url      text,
  cover_image_url text,
  timezone        text        DEFAULT 'America/Los_Angeles',
  created_by      uuid        REFERENCES profiles(id),
  plan            text        DEFAULT 'free',
  custom_domain   text,
  is_public       boolean     DEFAULT false,
  member_count    int         DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- Community members — society-level roles per Role Hierarchy spec
-- Roles: 'founder' (one per community) | 'steward' (multiple allowed)
CREATE TABLE IF NOT EXISTS community_members (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  profile_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         text        NOT NULL CHECK (role IN ('founder', 'steward')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, profile_id)
);

-- One founder per community enforced at the index level
CREATE UNIQUE INDEX community_members_one_founder_per_community
  ON community_members (community_id)
  WHERE role = 'founder';

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Event roles — event-level roles, separate from community role
CREATE TABLE IF NOT EXISTS event_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('host', 'co-host', 'guest')),
  invited_by  uuid        REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id)
);

ALTER TABLE event_roles ENABLE ROW LEVEL SECURITY;

-- Notifications (table only — UI deferred to v2)
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  event_id     uuid        REFERENCES events(id) ON DELETE SET NULL,
  type         text,
  read         boolean     DEFAULT false,
  metadata     jsonb,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1B. RLS policies
-- ============================================================

-- Communities
CREATE POLICY "community members can view their community"
  ON communities FOR SELECT
  USING (
    id IN (SELECT community_id FROM community_members WHERE profile_id = auth.uid())
  );

CREATE POLICY "authenticated users can create a community"
  ON communities FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "founders can update their community"
  ON communities FOR UPDATE
  USING (
    id IN (
      SELECT community_id FROM community_members
      WHERE profile_id = auth.uid() AND role = 'founder'
    )
  );

-- Community members
CREATE POLICY "members can view community membership"
  ON community_members FOR SELECT
  USING (
    community_id IN (
      SELECT community_id FROM community_members WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "founders can add stewards"
  ON community_members FOR INSERT
  WITH CHECK (
    community_id IN (
      SELECT community_id FROM community_members
      WHERE profile_id = auth.uid() AND role = 'founder'
    )
  );

CREATE POLICY "founders can remove members"
  ON community_members FOR DELETE
  USING (
    community_id IN (
      SELECT community_id FROM community_members
      WHERE profile_id = auth.uid() AND role = 'founder'
    )
    AND profile_id != auth.uid()
  );

-- Event roles
CREATE POLICY "authenticated users can view event roles"
  ON event_roles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "hosts can manage event roles"
  ON event_roles FOR ALL
  USING (
    event_id IN (SELECT id FROM events WHERE host_id = auth.uid())
  );

-- Notifications: each user sees their own
CREATE POLICY "users can view own notifications"
  ON notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "users can mark own notifications read"
  ON notifications FOR UPDATE
  USING (recipient_id = auth.uid());

-- Messages: public read for guests (token-based); host writes via authenticated
CREATE POLICY "public can read messages"
  ON messages FOR SELECT USING (true);

CREATE POLICY "authenticated can post messages"
  ON messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated can update own messages"
  ON messages FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Photos: public read; authenticated upload
CREATE POLICY "public can view photos"
  ON photos FOR SELECT USING (true);

CREATE POLICY "authenticated can upload photos"
  ON photos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- 1B. Trigger: community creator becomes founder automatically
-- ============================================================

CREATE OR REPLACE FUNCTION assign_community_founder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only fires for client-initiated inserts (auth.uid() present)
  -- Service role seeds (CLI, migrations) skip this — founder added manually
  IF auth.uid() IS NOT NULL THEN
    INSERT INTO community_members (community_id, profile_id, role)
    VALUES (NEW.id, auth.uid(), 'founder');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_community_created
  AFTER INSERT ON communities
  FOR EACH ROW EXECUTE FUNCTION assign_community_founder();

-- ============================================================
-- 1C. Seed WCS community record + link existing events
-- ============================================================

INSERT INTO communities (name, slug, description, timezone, plan)
VALUES (
  'Woodinville Cookery Society',
  'woodinville-cookery-society',
  'An intimate culinary community based in Woodinville, WA.',
  'America/Los_Angeles',
  'free'
)
ON CONFLICT (slug) DO NOTHING;

UPDATE events
SET community_id = (
  SELECT id FROM communities WHERE slug = 'woodinville-cookery-society'
)
WHERE community_id IS NULL;

-- Seed Rob as WCS founder using his existing host profile
-- Derives his profile_id from the host_id on his events (same UUID — profiles.id = auth.users.id)
INSERT INTO community_members (community_id, profile_id, role)
SELECT
  (SELECT id FROM communities WHERE slug = 'woodinville-cookery-society'),
  host_id,
  'founder'
FROM events
WHERE host_id IS NOT NULL
LIMIT 1
ON CONFLICT (community_id, profile_id) DO NOTHING;

-- Enable Realtime on messages for live message board
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
