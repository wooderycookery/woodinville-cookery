-- Allow public SELECT on guests so anon clients can subscribe to realtime
-- changes and query attending counts. Contact data (name, email) is on the
-- contacts table which has no public read policy, so no PII is exposed here.
create policy "Public can view guest attendance"
  on guests for select using (true);

-- Add guests to the realtime publication so postgres_changes subscriptions work.
alter publication supabase_realtime add table guests;
