-- Sprint 2: Bring-list tables

create table if not exists bring_list_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  category text not null,
  label text not null,
  slots_total int not null default 1,
  created_at timestamptz default now()
);

create table if not exists bring_list_claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references bring_list_items(id) on delete cascade,
  guest_id uuid references guests(id) on delete cascade,
  note text,
  claimed_at timestamptz default now(),
  unique(item_id, guest_id)
);

alter table bring_list_items enable row level security;
alter table bring_list_claims enable row level security;

-- Items: public read; authenticated host can write
create policy "Public can read bring list items"
  on bring_list_items for select using (true);

create policy "Authenticated can manage bring list items"
  on bring_list_items for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Claims: public read (required for guest view + realtime)
create policy "Public can read bring list claims"
  on bring_list_claims for select using (true);

-- Enable realtime on claims table
alter publication supabase_realtime add table bring_list_claims;
