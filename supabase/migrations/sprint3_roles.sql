-- Sprint 3 — Role Hierarchy
-- Two-layer role system per Role Hierarchy spec (2kz9t6vy-497)
-- Society-level: founder | steward → community_members
-- Event-level:   host | co-host | guest → event_roles

-- ============================================================
-- 1. Societies (table only — policies added after community_members exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS societies (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  slug          text        NOT NULL UNIQUE,
  tagline       text,
  contact_email text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE societies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Community members (society-level roles)
-- ============================================================

CREATE TABLE IF NOT EXISTS community_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id  uuid        NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('founder', 'steward')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (society_id, user_id)
);

-- One founder per society enforced at the index level
CREATE UNIQUE INDEX community_members_one_founder_per_society
  ON community_members (society_id)
  WHERE role = 'founder';

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Societies RLS policies (now that community_members exists)
-- ============================================================

-- Any authenticated user can create a society (trigger makes them founder)
CREATE POLICY "authenticated users can create a society"
  ON societies FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Members of a society can view it
CREATE POLICY "society members can view their society"
  ON societies FOR SELECT
  USING (
    id IN (
      SELECT society_id FROM community_members WHERE user_id = auth.uid()
    )
  );

-- Only founders can update society settings
CREATE POLICY "founders can update their society"
  ON societies FOR UPDATE
  USING (
    id IN (
      SELECT society_id FROM community_members
      WHERE user_id = auth.uid() AND role = 'founder'
    )
  );

-- ============================================================
-- 4. Community members RLS policies
-- ============================================================

-- Any member of a society can see the full member list
CREATE POLICY "society members can view membership"
  ON community_members FOR SELECT
  USING (
    society_id IN (
      SELECT society_id FROM community_members WHERE user_id = auth.uid()
    )
  );

-- Founders can add stewards
CREATE POLICY "founders can add stewards"
  ON community_members FOR INSERT
  WITH CHECK (
    society_id IN (
      SELECT society_id FROM community_members
      WHERE user_id = auth.uid() AND role = 'founder'
    )
  );

-- Founders can remove members (but not themselves)
CREATE POLICY "founders can remove members"
  ON community_members FOR DELETE
  USING (
    society_id IN (
      SELECT society_id FROM community_members
      WHERE user_id = auth.uid() AND role = 'founder'
    )
    AND user_id != auth.uid()
  );

-- ============================================================
-- 5. Trigger: society creator becomes founder automatically
-- ============================================================

CREATE OR REPLACE FUNCTION assign_society_founder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO community_members (society_id, user_id, role)
  VALUES (NEW.id, auth.uid(), 'founder');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_society_created
  AFTER INSERT ON societies
  FOR EACH ROW EXECUTE FUNCTION assign_society_founder();

-- ============================================================
-- 6. Event roles (event-level roles)
-- ============================================================

CREATE TABLE IF NOT EXISTS event_roles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_id   uuid        REFERENCES guests(id) ON DELETE SET NULL,
  role       text        NOT NULL CHECK (role IN ('host', 'co-host', 'guest')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_roles_actor_check CHECK (
    (user_id IS NOT NULL AND guest_id IS NULL) OR
    (user_id IS NULL AND guest_id IS NOT NULL)
  ),
  UNIQUE (event_id, user_id),
  UNIQUE (event_id, guest_id)
);

ALTER TABLE event_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can view event roles"
  ON event_roles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "hosts can manage event roles"
  ON event_roles FOR ALL
  USING (
    event_id IN (
      SELECT id FROM events WHERE host_id = auth.uid()
    )
  );
