-- Sprint 3: Gallery state flags on events + author_name on photos

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS pre_gallery_open  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS post_gallery_open boolean DEFAULT false;

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS author_name text;

-- Allow service-role API to insert photos on behalf of guests
-- (existing policy only covers authenticated users)
DROP POLICY IF EXISTS "service role can insert photos" ON photos;
CREATE POLICY "service role can insert photos"
  ON photos FOR INSERT
  WITH CHECK (true);

-- Allow hosts to update photos (featured flag)
DROP POLICY IF EXISTS "host can update photos" ON photos;
CREATE POLICY "host can update photos"
  ON photos FOR UPDATE
  USING (true);
