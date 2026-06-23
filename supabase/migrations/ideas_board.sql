-- Ideas Board — society-level gathering ideation

CREATE TABLE IF NOT EXISTS ideas (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        REFERENCES events(id) ON DELETE SET NULL,
  author_name text        NOT NULL,
  body        text        NOT NULL,
  season      text,
  scale       text,
  created_at  timestamptz DEFAULT now(),
  pinned      boolean     DEFAULT false,
  archived    boolean     DEFAULT false
);

ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read non-archived ideas"
  ON ideas FOR SELECT
  USING (archived = false);

CREATE TABLE IF NOT EXISTS idea_interests (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_id    uuid        NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  guest_id   uuid        NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (idea_id, guest_id)
);

ALTER TABLE idea_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read idea interests"
  ON idea_interests FOR SELECT
  USING (true);

-- Seed ideas in The Society's voice
INSERT INTO ideas (author_name, body, season, scale) VALUES
  (
    'The Society',
    'A late-September dinner built around whatever''s coming out of the garden — something that captures the end of summer before the rains return.',
    'Fall',
    'Intimate'
  ),
  (
    'The Society',
    'A wine and cheese evening. Serious cheeses, bottles people actually want to talk about, no fuss beyond that.',
    'Winter',
    'Intimate'
  ),
  (
    'The Society',
    'Something outdoors while we still can — a fire, a long table, people who know how to cook.',
    'Summer',
    'Gathering'
  );
