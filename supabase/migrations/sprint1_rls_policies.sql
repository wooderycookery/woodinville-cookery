-- RLS Policies for Sprint 1
-- Events: public read (landing page works unauthenticated), host writes own events
create policy "Public can view events"
  on events for select using (true);

create policy "Host can insert own events"
  on events for insert with check (auth.uid() = host_id);

create policy "Host can update own events"
  on events for update using (auth.uid() = host_id);

-- Profiles: each host manages their own row
create policy "Host manages own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Contacts: any authenticated user can manage (Sprint 1 — single host)
create policy "Authenticated can manage contacts"
  on contacts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Guests: any authenticated user can manage
create policy "Authenticated can manage guests"
  on guests for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Storage: authenticated users can upload to event-images bucket
create policy "Authenticated can upload images"
  on storage.objects for insert
  with check (
    bucket_id = 'event-images'
    and auth.role() = 'authenticated'
  );
