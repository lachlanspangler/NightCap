# M1 privacy & trust-and-safety review (adversarial)

Scope: the consent, block, report, deletion, age, location, invite, City Nights and copy promises, checked against migrations 0000–0010, `apps/api/src`, `packages/core/src` and `apps/mobile/app`. Baseline `npx vitest run`: 20 files, 262 tests, all green. CONFIRMED means I reproduced it with a scratch API probe (`apps/api/test/zz-probe-privacy.test.ts`, now deleted) or traced it line by line. PLAUSIBLE means it depends on deployment or on how people behave. I don't repeat the m1-code findings.

## Critical

**C1. The person you're afraid of can't be blocked or removed where it matters.** CONFIRMED.

- The only Block button in the app is on a City table, and it disappears once the night ends (`app/city/[eventId].tsx:137-144`). There's no block on a crew, a night or a photo. `you.tsx` can only _unblock_.
- No route removes someone from a night (no `/nights/:id/members`). Yet PRIVACY_SAFETY T4 says "host can remove anyone".
- Removing someone from a crew counts as a drunk-regret action, so at night it's deferred to the morning (`routes/crews.ts:336-370`, `drunk.ts:42`). Even after it runs, it only deletes `crew_members` (`services/deferred.ts:11-15`). Probe: the owner removes "Creep" at 21:00 → 202 deferred. After the removal, Creep still saw the unlocked album (200, 1 shot).
- Leaving the crew is deferred too. So at 1am a person being harassed can't block, can't remove, and can't leave.

**Fix:** add Block to every profile, participant and photo surface. Add host "remove from night", which deletes their `night_members` row and is never deferred. Make `remove_member` a safety action (`shouldDefer` → false), and have it also drop the person from the crew's live night. Do the same for `leave_crew` when the caller has blocked someone in the crew.

**C2. Nobody ever reads a report, and the evidence can be destroyed.** CONFIRMED.

- No code reads `reports` (grep: zero readers). There's no moderation queue, not even the promised dev list.
- After a `minor` report, the author can still `DELETE /shots/:id`, which hard-deletes the media (`routes/shots.ts:58-70`). Probe: the report stays `open` and the media is gone.
- The `minor` label reads "Someone in it is under 21" (`consent.ts:94`). That lumps an underage drinker in with possible CSAM. The second case needs preservation and NCMEC reporting (18 U.S.C. §2258A), and NCII needs fast takedown plus hash-blocking.

**Fix:**

- Split the category into "under 18 / sexual content of a minor" and "under 21".
- Once a shot gets a `minor` or `nudity` report, move its media to a locked evidence store and block author deletion (soft-hide only).
- Build a moderator queue with SLAs.
- Hash the reported image so it can't be uploaded again.

## High

**H1. A block doesn't hide where you are, and the blocked person can lock you out of your own night.** CONFIRMED.

- Maya blocks Ex (same crew) and starts a night at the venue "Maya's place, 3rd fl". Ex's `GET /nights/:id` returns 200 with that venue and `startedBy = Maya`. Ex's crew card shows the same live night (`crews.ts:175-183`). This works because `can_see_night` admits any crew member (`0001_core.sql:246-256`).
- Second probe: Ex joins Theo's crew night first, and Maya's join then fails with `404 unavailable`. `nc_join` (`0007:71`) refuses whoever arrives _second_.

**Fix:**

- Hide `venue_label`, `title` and `started_by` from people who aren't participants. Hide the live night itself from anyone blocked by a participant.
- When the blocker joins, let them in and have the blocked person shown a generic "night ended" message.

**H2. Night links and codes can be forwarded without limit, with no approval and no notice.** CONFIRMED.

- Night invites are created with `max_uses = null`. Any guest can mint more and is shown the code (`routes/nights.ts:89-110`). The share copy is built for group chats ("Join tonight's roll… Code 1234: link").
- Probe: 5 strangers redeemed one link, a guest minted a second link, and a stranger saw the album in the morning.
- Joining by code alerts no one: the host's notifications were empty.
- There's no route to revoke an invite or rotate the code, though the docs promise both.

**Fix:**

- Only the host (or a crew member) can create invites.
- Cap invite uses and require host approval for `via in ('code','invite')`, or at least notify the host with a one-tap remove.
- Add revoke and rotate routes.

**H3. Anyone who has been reported can never delete their account.** CONFIRMED.

- `reports` has `check (shot_id is not null or reported_user_id is not null)`, and both columns are `on delete set null` (`0001_core.sql:159-165`). Deleting the author nulls both, the check fails, and `DELETE /me` returns 422.
- Any participant can file a report, so this is a weapon: one report traps a friend in the app. It also breaks App Store 5.1.1 and erasure rights.

**Fix:** keep reports as their own evidence records. Snapshot the reported user's id into a non-FK column, drop the check, and keep media in evidence as in C2.

**H4. A subject can only veto a photo after everyone has already seen it.** CONFIRMED.

- Before the unlock, a tagged subject can't see the shot. `POST /shots/:id/hide` returns 404, and `/me/tags` comes back empty because it joins `shots` under RLS (`me.ts:157`).
- At the unlock, `album_ready` goes to everyone at the same moment. "Hides win" therefore only works after the exposure.

**Fix:** at the unlock, give subjects of tagged shots a short private preview, about 30 minutes before release. Or let a subject's pending tag hold the shot until they answer or a timeout passes. Let subjects pre-emptively say "hide anything I'm tagged in tonight".

## Medium

**M1. Nudges ignore blocks and mutes.** CONFIRMED (trace). `runNudges` (`services/moments.ts:96-150`) and `computeNudges` (`nudges.ts:73-81`) never read `blocks`, and they check mutes only on the recipient. Your blocked ex can get "Maya hasn't been in a Nightcap for a while. Send them a ping?" That pushes them toward contact and reports your activity. **Fix:** skip pairs where `blocked_either` is true, and don't nudge about members who muted the crew.

**M2. "Leave this table" is one tap and destroys your photos.** CONFIRMED (trace). It's a plain BigButton (`city/[eventId].tsx:201-208`). The route deletes every shot you took, even after the unlock, with no hold and no undo (`routes/city.ts:417-443`). That breaks rule 5. It also deletes your `city_table_members` row, which erases the "met before" history that seating uses. **Fix:** leave immediately and keep your photos held. Ask "remove my photos too?" with a hold-to-confirm. Keep the seat row with `left_at` set.

**M3. City Nights is missing promised safety tools.** CONFIRMED (trace).

- There's no Report at the table: no user-report route exists at all.
- There's no Block after the night ends.
- "Only woman at the table" is only a soft cost (`city.ts:89-91`). MEET_PEOPLE #11 promises "nobody ends up the only person of their gender".
- "You're first in line next time" isn't implemented.

**Fix:** add a `POST /reports` route for users. Keep Block available after the night. Make the lone-woman case a hard constraint that waitlists instead of seating her alone. Implement waitlist priority or drop the copy.

**M4. Tag errors reveal a subject's private decision.** CONFIRMED. If a tagger re-tags someone who removed their tag, the API answers `409 subject_removed`. A third party tagging the same person gets `409 already_tagged`, which reveals a pending tag (`routes/shots.ts:105-137`). **Fix:** return 201 and quietly no-op.

**M5. Deleting your account leaves the photos of you.** CONFIRMED. Theo approves a tag and then deletes his account. Jules still sees the photo (`services/deferred.ts:27-56`: only hides made before deletion survive). The button promises "Deletes your photos everywhere". **Fix:** offer "also hide every photo I'm tagged in". Reword the copy to "photos you took".

## Low

- **L1. The 21+ gate exists only in `/dev/signup`** (`routes/dev.ts:35-60`). Prod has no way to create a profile, so there's no gate at all. The "short-lived device flag" against instant retries isn't built (`signup.tsx`). The age check uses a `tz` the client supplies, and the full DOB is kept forever. PLAUSIBLE for prod. Fix these in the real sign-up, and keep only `is_21` plus the verified-at time.
- **L2. The PNG stripper is a denylist** (`exif.ts:87`). Private or unknown ancillary chunks (C2PA `caBX`, vendor chunks) pass through. Switch to an allowlist: IHDR, PLTE, IDAT, IEND, tRNS, gAMA, cHRM, sRGB, iCCP.
- **L3. Copy that promises more than the code delivers.**
  - "Blocking hides you from each other everywhere, and they're never told" (`you.tsx:138`). In fact the crew list, live-night venue and `startedBy` (shown with "0 people") all still show.
  - "No location, ever" (`you.tsx:26`). The venue label goes to the whole crew, and member `city` is shown.
  - "Nobody else sees the tag until you keep it". The tagger sees it.
  - "Someone in this photo hid it" names the hider whenever only one person was tagged.
- **L4. The author keeps a hidden shot and can still "Save to my photos".** Tell the subject honestly: "the person who took it still has it".

## Promises kept (verified)

- **Nothing is visible before the unlock.** No shots, tags or URLs leaked to other participants in any probe. `can_see_shot` matches core.
- **Hides hold.** Only the hider can lift one, the author can't, and hides outlive the hider's account (0005). A report hides the shot from the reporter (0009).
- **Tossed means gone.** Discarded shots' media is deleted at the unlock and disappears from the author's view.
- **JPEG metadata is stripped.** The marker walk handles EXIF/XMP/IPTC/COM and drops everything after EOI.
- **Media URLs are tight.** They're signed per viewer, re-checked under RLS on every fetch, and served `no-store`. Request logs leave out query strings.
- **Blocks hold at the door.** A blocked user can't join by code or invite, and gets the same generic error as a wrong code. Blocked pairs are split at City tables, and a group needs the friend's invite.
- **City Nights stays private.** A keep-in-touch "no" is invisible. Signups show a count only. Names appear 2h before.
- **Private profile columns stay private.** `birthdate` and `gender` aren't granted to `authenticated`.

## Acceptable for a prototype, must close before real users

- Real ID or age verification, plus a sign-up path that enforces 21+.
- A StopNCII/PhotoDNA hash check on upload.
- A moderator tooling SLA.
- Purging hidden-shot media after 30 days.
- Screenshot notice (I-062).
- PostgREST exposure off (ADR 0009).
- Block evasion through new accounts, which needs device or phone binding.

Sign-off: no — fix C1, C2, H1, H2, H3, H4 first.

## Round 2 (verifying fdba6ff + 5cfc49a)

Baseline: `npx vitest run` → 284 tests green. Re-probed with a scratch test (`apps/api/test/zz-probe-privacy2.test.ts`, deleted). Mobile tests were not run (vitest only).

**Verified fixed:** C2 (under_18/under_21 split, evidence hold survives author delete _and_ author account deletion with `media_key_snapshot`, hash denylist, `/dev/reports`), H2 (guests can't mint links or see the code, cap 10, `joined_your_night`, rotate revokes, NULL-safe `nc_is_host`), H3 (reported author deletes fine, report survives), M2, M4, M5, L1 (server-clock 21+), L2 (PNG allowlist), `remove_member` no longer deferred and drops undeveloped-night membership, lone-woman hard rule (solo women only).

### Still wrong / new

**R2-1 (high, CONFIRMED): H4's preview lets a tag leak a photo _during the live night_, and any subject can pass it on.** `0011_safety.sql:100` admits a tagged subject whenever `unlocked_at is null` (not only in the morning review), and `shot_tags_insert` lets anyone who can see the shot tag others. Probe: Maya shoots at 21:00, tags Theo → Theo sees it; Theo tags Jules → Jules sees it and `GET /media` = 200, all mid-night. That breaks rule 1 and lets a non-author widen an unreviewed shot. **Fix:** preview only after `ended_at` (the review phase), only for tags whose `tagger_id = author_id`; non-authors can't tag before the unlock. Copy "only you (and anyone you tag)" then holds.

**R2-2 (high, CONFIRMED): "Remove from night" isn't a ban.** `remove_from_night` (`0011:167-179`) only deletes the row. Probe: removed Creep re-entered at once via `POST /nights/:id/join` (200) and via the code (200, crew members still get it). **Fix:** record `night_bans (night_id, user_id)`; `nc_join` refuses them (generic `unavailable`); rotate the code on remove; optionally offer "also block".

**R2-3 (medium, CONFIRMED): the H1 fix hides the crew's night from the _blocker_ too.** `can_see_night` uses `blocked_either` (`0011:125`), so once Ex joins Theo's night, Maya (who blocked Ex) gets `liveNight: null`, `GET /nights/:id` 404, and `409 crew_has_live_night` if she tries to start her own. She can join only by guessing the id (200). Net effect: the blocked person still locks the blocker out of the UI, and the 409 is an oracle. **Fix:** hide only from the _blocked_ side (`b.blocker_id = m.user_id and b.blocked_id = auth.uid()`), matching `nc_join`.

**R2-4 (medium, CONFIRMED): M1 is half-wired.** `computeNudges` takes `blockedPairs`, but `runNudges` never passes it (`services/moments.ts`, grep: no caller). Blocked pairs are still nudged about each other. Muted subjects are fixed. **Fix:** load blocks among crew members and pass the pair set; add an API-level test.

**R2-5 (medium, CONFIRMED): reports still die with the reporter and can't be filed after leaving a table.** `reports.reporter_id … on delete cascade` (0001:158): the reporter deleting their account erased the report (1 → 0). And `report_user` needs `shares_space`, which now filters `left_at`, so "leave the table, then report" returns 404 (block still works). **Fix:** `on delete set null` + `reporter_snapshot`; let `report_user` accept anyone you `were_tablemates` with or shared a night with, ignoring `left_at`.

**R2-6 (low):** evidence media has no access control, retention or escalation path beyond `/dev/reports` (prod gap, keep it on STATUS). The under-21 instant-retry flag is still not built. The lone-woman rule ignores solo non-binary people despite MEET_PEOPLE #11's wording.

Sign-off: no — fix R2-1, R2-2 (and R2-3) first; R2-4/R2-5 next loop.

## Round 3 (verifying 410fc64 + c433023, migration 0012)

Baseline: `npx vitest run` → 288 tests green. Re-probed with a scratch test (`apps/api/test/zz-probe-privacy3.test.ts`, deleted).

**Verified fixed:**

- R2-1: a mid-night tag reveals nothing (subject sees 0 shots); after the night ends the author-tagged subject previews and can hide; a subject's own tag before the unlock is refused (403) and the third person sees 0.
- R2-2: a removed member is banned: crew rejoin, old code and new code all 404, the night 404s and drops off their crew card; the code rotated; a guest can't remove the host (403).
- R2-3: the blocker keeps the crew night and can join after the blocked person did; mutual invisibility holds inside it. The blocked side can't see or join the blocker's night.
- R2-4: `runNudges` passes crew block pairs.
- R2-5: a report survives the reporter's deletion (`reporter_id` null, snapshot kept); reporting after leaving a table works; strangers can't report (404).
- R2-6: solo non-binary people covered by the lone rule.

**Residual (low, acceptable for the prototype):**

- The blocked side still gets `409 crew_has_live_night` if they try to start a night while the blocker's is live: it tells them a night exists, not where or whose. Fix later with a generic "can't start right now".
- A preview shot the author then tosses has already been seen (and could be saved) by the tagged subject. That's the author's own choice to tag; say so in the review copy ("people you tag see it now").
- Production gaps stay on STATUS: real ID verification, NCMEC/StopNCII and a moderator tool, evidence access control and retention, perceptual hashing, block evasion via new accounts, the under-21 retry flag, PostgREST exposure off.

Sign-off: yes, for milestone 1 in mock mode. The production gaps above must close before real users.
