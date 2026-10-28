# PRIVACY & SAFETY: consent, untagging, friends-only, no location leaks, blocking, 21+

> NightCap is an app full of photos of _other people_, taken at night, sometimes drunk. That makes
> consent the product, not a compliance checkbox. Rules here are enforced in three places: core
> logic (`album.ts`, `consent.ts`, `permissions.ts`), Postgres RLS (`packages/db`), and the API.
> RLS is the last line: even a buggy API can't leak a locked or hidden photo.

## Threat model (who could get hurt, and how)

| #   | threat                                     | example                                                            | mitigation                                                                                                                                                                                                                   |
| --- | ------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Unwanted exposure of a subject**         | an unflattering or compromising photo of you revealed to the group | morning review (author discards), **hide-me** (any tagged or claimed subject hides it from everyone but the author), never public                                                                                            |
| T2  | **Leak beyond the group**                  | a photo forwarded or screenshotted to outsiders                    | friends-only; links need membership; no public URLs; signed media URLs expire in 10 min; screenshot detection (later, I-062). Honest copy: "people you're with can always screenshot"                                        |
| T3  | **Location leaks / stalking**              | EXIF GPS in a photo; "where they are tonight"                      | **no GPS stored**; EXIF/XMP stripped server-side before storage; venue is optional free text; no live map; City Night members never see each other's location                                                                |
| T4  | **Harassment by an ex or creep**           | someone joins your night by code to watch you                      | night codes expire at night end, can be rotated; host can remove anyone; **blocks are mutual invisibility** (can't join the same night via code, can't be seated at the same City Night table, don't see each other's shots) |
| T5  | **Minors**                                 | under-21s at bars; minors in photos                                | 21+ DOB gate at sign-up (ID verification stubbed, with a clear TODO); the City Nights gate needs "verified"; report category "minor in photo" → hidden pending review                                                        |
| T6  | **Drunk regret**                           | posting/sending something at 2am                                   | nothing visible until the morning; irreversible actions deferred (DRUNK_UX)                                                                                                                                                  |
| T7  | **Non-consensual intimate imagery (NCII)** | nudity taken/shared without consent                                | report → immediately hidden for everyone except the reporter's own view of "hidden"; moderator queue; hash-matching integration (StopNCII / PhotoDNA) is a production TODO                                                   |
| T8  | **Strangers at City Nights**               | aggressive follow-up after meeting                                 | no DMs; contact only after mutual opt-in; block/report from the table; code of conduct; share-my-plan                                                                                                                        |
| T9  | **Account takeover / API abuse**           | enumerating shots, guessing codes                                  | UUIDs; codes are 4 digits **scoped to live nights + rate-limited + need auth**; invite tokens are 128-bit random with only the hash stored; per-account write rate limits                                                    |
| T10 | **Data retention**                         | old embarrassing photos forever                                    | delete own shot anytime (hard delete of media); delete account wipes media; hidden shots purge media after 30 days (prod TODO)                                                                                               |

## The consent model (exact rules)

**Roles per shot:** _author_ (took it), _participants_ (joined the night), _subjects_ (tagged, or
self-identified "that's me").

1. **Before the unlock:** only the author sees the shot. Others see counts only ("Theo · 9 shots").
2. **Morning review (hold until morning):** the author keeps or discards each shot. Discarded
   shots are never revealed, and their media is deleted at the unlock. Unreviewed shots are kept
   by default (THE_NIGHT.md has the reasoning).
3. **After the unlock:** participants see released shots that aren't hidden and whose author
   isn't blocked by them or blocking them.
4. **Tagging:**
   - Anyone in the night can tag a participant. A tag starts **pending** and is visible only to
     the tagged person, who sees "Theo tagged you in 3 photos" → _Keep tag_ / _Untag_ / _Hide photo_.
   - Pending tags _never_ widen visibility. Tags only ever feed recaps the subject agreed to.
   - Self-tag ("that's me") is approved immediately.
5. **Hide-me:** any subject, or any participant claiming "that's me", can hide a shot. Hidden
   shots disappear for everyone except the author, who sees "hidden by someone in it" (not who,
   so there's no retaliation). The author can delete it but **cannot un-hide it**. Only the hider
   can un-hide. Hides win over the author.
6. **Untag** removes the tag only. The shot stays visible (for "it's fine, just don't link me").
7. **Recaps and moments** only use shots that are released, not hidden, and visible to the viewer.
   "On this night" shows a viewer only albums they were in.
8. **Export:** "Save all" saves the viewer's visible shots to their own device. That's honest:
   participants can always keep what they could see.
9. **Leaving a night** keeps your shots in the album. **Deleting a shot** hard-deletes the media.
   **Deleting your account** deletes all your shots and media, tags of you, and your memberships.

## Friends-only by default

- No public surface at all: no public profiles, no public albums, no discoverable users, no search
  for people.
- Crews are invite-only. A night album is visible only to the people who joined that night (not
  the whole crew).
- Invite links/QRs carry a random token. The server stores a SHA-256 hash, tokens expire (crew
  invites 7 days, night invites at night end), and the owner can revoke them.

## No location leaks

- The client takes photos with `exif: false`. The server strips again regardless (APP1 EXIF/XMP,
  APP13 IPTC, COM segments removed from JPEGs) before writing to storage. A unit test feeds a
  JPEG with GPS EXIF and asserts it's gone.
- No location permission requested at all in the prototype.
- City is chosen from a list, not detected.

## Blocking & reporting

- Block = **mutual invisibility**: neither sees the other's shots. Neither can join a night the
  other is in via code (the error is generic: "This night isn't available"). They're never seated
  together at City Nights, and neither appears in the other's crew suggestions. The blocked person
  isn't notified.
- If two people are already in the same crew: the crew still works, but each one's shots are
  hidden from the other and they're never tagged together. "Remove from crew" is for owners.
- Report categories: _I'm in this and don't want it shared_, _nudity or sexual content_, _minor_,
  _harassment_, _violence_, _other_. Reports with a subject category auto-hide the shot for
  everyone pending review. In the prototype, reports go to a `reports` table and a dev moderation
  list.
- Never deferred by night mode: safety actions (block, report, hide) are always immediate.

## 21+ age gate

- DOB at sign-up. Under 21 → "NightCap is for 21+" and no account is created (we keep only a
  short-lived device flag to stop instant retries, not the DOB). DOB is stored only as `birthdate`
  in a column clients can't read (it's never returned by the API, only `is_21_plus`).
- **ID verification is stubbed:** `age_verified_at` stays null, and City Nights shows "Verify
  you're 21+ (coming soon: ID check)". In mock mode a dev toggle sets it. Production TODO: Persona,
  Stripe Identity or Yoti age estimation.
- Joining a night by code also requires an account, so the 21+ attestation happens there too.

## Data minimisation

- We store first name (display), DOB (private column), crews, nights, shots (media key, dims,
  taken_at), tags, reactions, blocks and reports. No phone contacts upload. No location. No
  analytics SDKs in the prototype.
- Media URLs are signed HMACs bound to (shot id, viewer id, expiry) so a URL leaked from one user
  can't be replayed after 10 minutes, and logs can't be used to enumerate.

## App Store guidelines touchpoints (for later)

- 1.2 UGC: report, block, filter (✓ report/block/hide; filtering = moderation queue TODO).
- 1.4.3 / 17+ rating with alcohol references, so frequent references → 17+. We're 21+ self-gated.
- 5.1.1 data collection: the account-deletion flow in-app (✓ designed, deferred-at-night but
  available).
