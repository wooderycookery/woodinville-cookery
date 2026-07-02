CREATE TABLE IF NOT EXISTS table_contributions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  rsvp_id         uuid        REFERENCES guests(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  item            text        NOT NULL,
  category        text,
  is_host_provided boolean    NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE table_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read table_contributions"
  ON table_contributions FOR SELECT USING (true);

CREATE POLICY "Service role all table_contributions"
  ON table_contributions USING (auth.role() = 'service_role');
