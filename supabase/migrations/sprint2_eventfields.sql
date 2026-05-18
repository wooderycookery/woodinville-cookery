-- Sprint 2: Event content fields
alter table events add column if not exists theme text;
alter table events add column if not exists dress_code text;
alter table events add column if not exists what_to_expect text;
alter table events add column if not exists rsvp_deadline date;
alter table events add column if not exists location text;
