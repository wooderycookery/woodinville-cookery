-- Sprint 2: RSVP flow
-- Safe to run even if columns already exist

alter table guests add column if not exists invite_token uuid default gen_random_uuid();
alter table guests add column if not exists rsvp_status text default 'no_response';
alter table guests add column if not exists rsvp_at timestamptz;
alter table guests add column if not exists dietary_notes text;

-- Unique index on invite_token for fast token lookups
create unique index if not exists guests_invite_token_idx on guests(invite_token);
