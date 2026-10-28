# M1 code review (staff-level, adversarial)

Scope: packages/core, packages/db (migrations + harness), apps/api, apps/mobile (light pass).
Baseline: `npx vitest run` → 18 files, 236 tests, all green. CONFIRMED = reproduced with a scratch
probe (since deleted) or traced line by line. PLAUSIBLE = depends on deployment or concurrency the
PGlite harness can't show.

## High

**1. EXIF stripper keeps everything after the first SOS, including data after EOI.** `apps/api/src/media/exif.ts:46-49`. CONFIRMED.
`stripJpeg` copies `bytes.subarray(i)` from the first SOS to the end of the buffer. So an APP1 Exif
segment between progressive scans survives, and so does anything appended after EOI (the iPhone
gain-map/MPF secondary JPEG with its own Exif, Pixel motion-photo MP4 trailers). The probe appended
`GPS=44.97,-93.26` after EOI and put an APP1 between scans: both came through. This breaks rule 3,
and the server strip is the only guarantee of it. **Fix:** stop at the first EOI. Then keep walking
markers after each scan's entropy data (skip `FF00` and RSTn; stop at the next real marker) and
apply the keep/drop rules to every segment. Reject or truncate any trailer. Add both cases to
`exif.test.ts`.

**2. City Nights: someone you blocked can make you share a table with them.** `apps/api/src/routes/city.ts:281-298`, `packages/core/src/city.ts:76-77`. CONFIRMED.
`withUserId` puts the caller into the friend's signup block if the two share a crew. It never asks
the friend, and it never checks `blocks`. `conflicts()` only checks a block against people already
at a table, never pairs inside the block. The probe: block `{A,B}` with A blocking B was seated
together. **Fix:** make joining a block a request the friend accepts. Reject it when
`blocked_either` is true. In `formTables`, drop or split a block that contains a blocked pair.

**3. The SECURITY DEFINER RPCs trust `p_now` and are callable by every role.** `0001_core.sql:8-9,303`, `0002_rpcs.sql` (all `p_now` RPCs). PLAUSIBLE (goes live on Supabase).
The comment says the time arguments are "still sanity-checked here". They aren't. Postgres also
grants EXECUTE to PUBLIC by default. Prod tokens are Supabase JWTs (`config.ts:51`), and Supabase
serves `public` over PostgREST. So any user with their own token can call
`/rpc/join_night_by_code` and move `p_now` forward 10 minutes per call. That skips the rate limit
and brute-forces all 10,000 codes in minutes. The same access lets a user backdate `mark_ready` or
`start_night`, and probe `blocked_either(a,b)` or `in_live_night(u)` for any users. **Fix:** move
the RPCs and helpers into a schema PostgREST doesn't expose, and `revoke execute … from public`.
In SQL, clamp `p_now` to `now()` ± a small skew (allow a bypass only when a mock-mode GUC is set).

## Medium

**4. Join-code oracle, and attempts that don't count.** `0002_rpcs.sql:99-104` together with `nc_join` raises. CONFIRMED.
If the caller is already in a live night, a valid code returns `409 already_in_live_night` and a
wrong one returns `404 unavailable`. The raise also rolls back the `code_attempts` insert. In the
probe, 31 valid-code tries recorded 0 attempts. That gives a free way to confirm codes. Even
without the oracle, 4 digits at 10 tries per 10 minutes is about 1,440 guesses a day per account
against every live night. **Fix:** make `nc_join` return a status instead of raising, so the
attempt row commits. Map every failure to `unavailable`. Add a cap on failed attempts per night,
and consider host approval for people who join by code.

**5. A broken prod config quietly falls back to mock mode, with `/dev` routes on.** `apps/api/src/config.ts:48-49`, `index.ts:20`. CONFIRMED (trace).
With `NIGHTCAP_MODE=prod` and any one key missing, the mode becomes `mock`, so `/dev/login` mints
a token for any user id and `/dev/clock` time-travels. **Fix:** when prod is requested and a key is
missing, throw at startup.

**6. Leaving a City table takes nothing away.** `routes/city.ts:374-383`. CONFIRMED.
The route only sets `left_at`. No policy reads it: `at_same_table`, `shares_space`,
`were_tablemates`, and `night_members` (the table's night) all ignore it. The person who left
still sees names and the album, and can still send keep-in-touch. **Fix:** filter
`left_at is null` in those helpers, and delete the `night_members` row while the night is live.

**7. Tossed shots show up as broken photos, and "Save all" fails.** `services/nights.ts:84-95,214-215`, `apps/mobile/app/album/[id].tsx:430-437`. CONFIRMED (trace).
At unlock the media of discarded shots is deleted, but `nightView` still returns those shots to
their author with a signed URL that now 404s. The unlocked album and "Save all" loop over every
shot. `downloadAsync` saves the 404 body as a file, `saveToLibraryAsync` then fails, and the whole
loop stops. The share copy also counts tossed shots. **Fix:** after unlock, leave
`status='discarded'` out of `nightView`, or make the mobile client filter it out.

**8. Races the single-connection harness hides.** PLAUSIBLE.
(a) Roll limit: `0001_core.sql:371-372` checks `count(*) < roll_size` under READ COMMITTED, so two
concurrent uploads can both pass at 23. (b) A review racing the unlock: `shots.ts:36-53` passes the
guard while the unlock is still uncommitted, and `advance()` (`nights.ts:84-95`) deletes the media
of a shot that just flipped from discarded back to kept. That leaves a visible photo with no file.
(c) The `album_ready` dedupe in `apply_night_advance` is a racy `not exists`. **Fix:** in
`advance`, take `select … for update` on the night row, and in the guard, lock the night row too
(`for share`). Enforce the roll limit with a counter on `night_members`:
`update … set shots = shots + 1 where shots < roll_size`. Add a unique index on notifications
`(user_id, kind, payload->>'night_id')`.

**9. A report doesn't hide the shot from the person who reported it.** `0002_rpcs.sql:217`, `album.ts:43-52`. CONFIRMED.
ADR 0004 says "V hasn't reported it (auto-hide for the reporter)". After a `harassment` report the
reporter still sees the shot, and so does everyone else. `rls.test.ts:412` checks only a third
party. **Fix:** add a `reported_by_viewer` rule to core and `can_see_shot`, plus a case in the
shared fixture.

## Low

10. **An owner who leaves leaves the crew with no owner.** `services/deferred.ts:11-16`. CONFIRMED: after the owner left, the only member still had role `member`. Hand ownership to the next member the way `delete_account` does.
11. **An unmapped foreign-key error returns 500 and reveals whether a user exists.** Blocking a uuid that doesn't exist → `23503` → 500 (`http.ts:91-94`, `db/src/index.ts:120-129`). CONFIRMED. Map `23503` to 404.
12. **The IP rate limit is keyed on a client-supplied `X-Forwarded-For`** (`app.ts:35`), and once there are more than 10k keys, `buckets.clear()` (`ratelimit.ts:27`) resets everyone's bucket. CONFIRMED (trace). Trust XFF only from a known proxy, and evict least-recently-used entries instead of clearing all.
13. **Uploads are buffered before the size check.** `c.req.formData()` reads the whole body when there's no `content-length` (`routes/nights.ts:188-199`). PLAUSIBLE memory DoS. Use Hono's `bodyLimit`.
14. **An invalid tz causes a 500.** Both `/dev/signup` and `/dev/clock` (`dev.ts:45,75`) accept any string. CONFIRMED (mock only). Use core's `isValidTimeZone`.
15. **Mobile `useApi` race.** One `alive` ref covers every path, and responses carry no generation id (`useApi.ts:11-25`). A slow response for the old path or the old user can land after a path change or `signIn` (`session.tsx:34-40`), overwrite the new state, and refill the cache. PLAUSIBLE. Ignore a response unless it belongs to the latest request.
16. **Hides don't clear client caches.** `media.ts:48` sends `private, max-age=600`, and expo-image keeps its own disk cache, so a hidden photo stays on devices that already loaded it. PLAUSIBLE. Send `no-store`, or evict the cache from the client when it gets a hide.

## What's good

- `time.ts`: the two-pass offset correction handles the DST gap and overlap correctly (traced against Chicago spring-forward and fall-back). Time stays out of RLS, and the clock is injected everywhere.
- `advanceNight` is idempotent, and `apply_night_advance` uses `coalesce`, so repeated advances converge.
- The shared visibility fixture runs against both core and RLS. `can_see_shot` matches `shotVisibility` on every rule it covers.
- JWT handling is tight: alg pinned, timing-safe compare, uuid `sub`, exp checked. Media URLs are HMAC'd per viewer and re-checked under RLS on every fetch.
- `LocalDiskStore` validates keys (allow-list regex, `..` rejected, prefix check), and keys are built on the server from uuids.
- Removed tags and subject hides are enforced in triggers, and hides survive account deletion (0005).

Sign-off: no. Fix #1, #2, #3, #4 and #7 first; #8 before any multi-connection Postgres.
