# Sprint 3 — Status Brief for PM Review
**Date:** May 11, 2026  
**Project:** Woodinville Cookery Society — Event Invitation Platform  
**Repo:** https://github.com/wooderycookery/woodinville-cookery  
**Live (production):** https://woodinville-cookery.vercel.app  
**Preview (Sprint 3 work):** https://woodinville-cookery-45tce7iwl-wooderycookerys-projects.vercel.app

---

## Sprint 3 — Goals Completed This Session

### Goal 1 — Schema Expansion ✅
Migration `sprint3_goal1_schema.sql` ran successfully against the linked Supabase project.

**What changed in the database:**
- `events` — added: slug, event_type, end_time, timezone, max_capacity, rsvp_limit, waitlist_enabled, is_private, status, cover_image_url, bring_list_enabled, message_board_enabled, community_id, cancelled_at, cancelled_reason
- `profiles` — added: display_name, avatar_url, bio, phone, community_id, member_since, preferred_contact
- `contacts` — added: phone, avatar_url, dietary_preferences, host_notes, tags, source, last_invited_at, events_attended
- `guests` — added: role, checked_in, checked_in_at, plus_one, plus_one_name, reminder_sent_at, invitation_opened_at, save_the_date_sent_at
- `bring_list_items` — added: display_order, description
- `messages` — created (was missing); added: author_name, author_role, edited_at, is_pinned, reply_to_id; Realtime enabled
- `photos` — created (was missing); added: caption, featured, width, height, file_size, mime_type
- **New tables:** `communities`, `community_members`, `event_roles`, `notifications`

**Seed data applied:**
- WCS community record created (`woodinville-cookery-society` slug)
- All existing events linked to the WCS community
- Rob seeded as community founder via `host_id` on existing events

**Role hierarchy implemented (per spec 2kz9t6vy-497):**
- Society-level: `founder` / `steward` in `community_members` (one founder per community enforced via partial unique index)
- Event-level: `host` / `co-host` / `guest` in `event_roles`
- Trigger: community creator auto-assigned as founder on authenticated insert (CLI/service role seeds bypass safely)

---

### Goal 2 — Message Board ✅ (built + deployed to preview)

**Schema patch applied:**
- `messages.author_name` (text) and `messages.author_role` (text, default `'guest'`) added
- RLS updated: public read on attendees channel; host-only read on hosts channel; authenticated insert; host update for pinning

**API — `api/post-message.js`:**
- Guest posting: validates invite token, checks RSVP status (must be `attending` or `maybe`), sets author_name/role from contact record
- Host posting: validates event ownership via `host_id`, pulls display_name from profiles
- Returns inserted message row

**Component — `src/components/MessageBoard.jsx`:**
- Supabase Realtime subscription on `messages` table (attendees channel)
- Host channel toggle: Guests / Hosts (hosts only)
- Pinned messages float to top with copper "· Pinned" indicator
- Host messages show copper "Host" badge
- Avatar initial derived from author_name
- Empty states: *"Nothing here yet. Be the first to leave a note."* (attendees) / *"Your private space. Notes between hosts stay here."* (hosts)
- Non-RSVP'd guests see: *"RSVP to join the conversation."*
- Enter to send, Shift+Enter for newline

**Wired into `EventLanding.jsx`:**
- Guests: message board appears after bring list, only for confirmed RSVPs (attending or maybe)
- Hosts: message board appears in the host section with full channel toggle, above "Add guests"

---

## Currently In Progress / Not Yet Started

| Goal | Status | Notes |
|------|--------|-------|
| Goal 1 — Schema | ✅ Done | Migrations applied |
| Goal 2 — Message Board | ✅ Done | On preview, needs prod deploy |
| Goal 3 — Photo Galleries | ⬜ Not started | `photos` table exists |
| Goal 4 — Event History | ⬜ Not started | — |
| Goal 5 — ICS Calendar | ⬜ Not started | — |

---

## Pending Before Prod Deploy
- Message board smoke test on preview URL
- Rob testing guest post flow (needs an attending RSVP + token)
- Logo update (Rob is revising in Illustrator — new asset pending)

---

## Open Items / Notes for PM
- **Guest identity (carry-forward from Sprint 2):** localStorage token is still a v1 tradeoff. "Send me my link" email recovery on `/my-invitations` is the flagged v1.5 fix.
