# Diary

Append-only. Newest at the bottom. Each entry: what changed, what broke, what I decided and why,
what it felt like.

## 2026-10-28 — Kickoff

- **Context read:** NightOut (Expo 54 / RN 0.81 / expo-router, Hono API with `createApp()` for
  in-process tests, Supabase + RLS, R2 media, Maestro smoke flow; SECURITY-TODO lesson: an `sk.`
  token prefixed `EXPO_PUBLIC_` shipped in the bundle → only public values ever reach the app).
  Game (Lagooner Beach), GetOffTheCouch and GameCred for the workflow shape: CLAUDE.md as an
  operating manual, WORKFLOW loop, append-only diary, JSON ideas ledger → generated IDEAS.md, ADRs,
  doctor/heal self-healing checks, STATUS with "needs from you".
- **Machine at kickoff:** load avg 41 on 14 cores, NightOut mid-`xcodebuild` (its Metro on 8095),
  disk 31 GB free (93% used). No docker, no supabase CLI, no maestro, no postgres. Node 20.20.
- **Decisions:**
  - `.npmrc` pins registry.npmjs.org: the machine default is the corp registry (401 without Midway).
  - Expo **SDK 54** (same as NightOut): SDK 58 is current but needs Node 22; the machine has Node 20.
  - No docker → no local Supabase stack. DB + RLS tests run on **PGlite** (real Postgres in WASM,
    in-process) with a small Supabase shim (auth.uid(), roles). ADR 0002.
  - Low disk + a busy neighbour → simulator runs use **Expo Go** (no xcodebuild of our own) first;
    a dev build is optional later. ADR 0007.
  - "Timeshare" from the brief: I couldn't verify an app by that name (web search only returns
    vacation timeshares). Covered the category instead, flagged in STATUS → "Needs from you".

## 2026-10-28 — Phase 1 done, backend built, vertical slice verified on our simulator

- **Phase 1:** 7 research docs, 78 ideas (15 rejected with reasons), ADRs 0001–0008.
- **Core** (`packages/core`, 130 tests): DST-safe local-time math (two-pass offset correction,
  no tz lib), night lifecycle (auto-end 05:00 or 12h, unlock 10:00 ≥ 6h after start, early reveal
  only from 07:00: the sober check), visibility predicate shared with SQL via one fixture,
  consent, permissions, invites/codes, 21+ gate, drunk-UX rules, weekly moments, recaps, nudges,
  City Night table forming. ESLint bans Date.now/new Date()/Math.random in core (verified).
- **DB** (`packages/db`, 62 tests): PGlite + a Supabase shim (ADR 0002). Every request runs
  as `authenticated` with JWT claims, so RLS is the gate. Bugs the tests found: rate-limit
  attempts rolled back with the error; INSERT…RETURNING blocked by a STABLE visibility function;
  removed tags invisible to their subject; recursive policy on city_table_members.
- **API** (`apps/api`, 38 tests): Hono, EXIF/XMP/IPTC stripping (pure byte parser), signed media
  URLs re-checked under RLS on every fetch (a hide kills an issued URL immediately), deferral of
  irreversible actions at night, City Nights, moments/recaps/nudges, dev routes only in mock mode.
  A seeded fuzz found greedy table seating could strand someone → rebalancing.
- **Mobile** (Expo SDK 54, 37 jest tests): 20+ screens. Verified for real on `NightCap iPhone`
  (our UDID) in Expo Go, driven by Maestro: `.maestro/core-loop.yaml` passes end to end (61 steps),
  screenshots `docs/media/core-*.png`, clip `docs/media/core-loop.mp4` (2:35).
- **What running it taught me** (none of this showed up in unit tests):
  - The DEV pill sat on the camera's CODE chip → moved to a left-edge tab.
  - Dev time travel backwards drained the API rate-limit bucket for hours → clamped, tested.
  - Countdowns didn't re-sync after time travel → clock subscription.
  - The reveal headline flipped back to the title on re-render → captured once.
  - Secondary buttons wrapped to two lines → tighter padding.
  - Expo Go's tarball is the .app's _contents_, and `simctl install` of a plain folder hangs.
- **Feel:** the night palette + generated bokeh viewfinder really reads as "out at a bar". The
  amber shutter is unmissable. The 3am "Get some sleep." card and the morning "I'm up. I'm good."
  are the most charming moments. The dawn gradient on reveal is the payoff. Weak spots: the
  develop animation is over before a screenshot can catch it (fine on video); the tiny film
  frames in the roll card are a bit busy.
- **Shared laptop:** wait-for-quiet held off ~25 min total while NightOut ran xcodebuild tests
  (load peaked at 156). Never touched its sim (34742057…) or its Metro (8095).
- **Decisions:** the Maestro flows use Expo Go (`host.exp.Exponent`) and `stopApp` before each run,
  because a running Expo Go keeps the old bundle. CI-mode Metro (no reload) is restarted after
  code changes; that keeps it predictable and light.

## 2026-10-28 — Milestone 1 reviews: design critic (signed off in round 2)

- **Round 1 (no sign-off):** the morning reveal had no ceremony; the album looked author-ordered;
  the camera copy said "not even you" while review lets you see your own; the 3am screen had no
  hero; Toss was one tap from Keep; the viewer was off-brand and hid consent behind "⋯"; the red
  dawn primary looked destructive; glyph-only camera controls.
- **Landed:** hold-to-develop gate (remembered per user) → sky ink→dawn over 3s → frames develop
  in time order with haptics; hour dividers; one promise ("Nobody else sees a thing until
  morning"); 64pt countdown hero + "Get some sleep" + sticky "I'm up. I'm good."; toss via an 8s
  undo toast; ink viewer with a visible "That's me, hide it"; ink dawn primary; labelled pills;
  🥴 out (never joke about drinking), ✨ in.
- **Maestro caught one more:** the undo toast at the bottom covered Keep and ate the next tap →
  toasts live at the top now. A person would have hit that too.
- **Round 2: signed off.** Still open (polish, not blocking): the contact sheet should develop
  in place instead of re-laying out; demo shots land in one hour bucket; 18pt floor for night
  body text; home's 3am primary action.
- **Found myself while waiting:** a hide disappeared with the hider's account (cascade), which
  would re-reveal the photo → sticky `subject_hidden` (migration 0005), mirrored in core + fixture.

## 2026-10-28 — Milestone 1 reviews: code reviewer (signed off in round 2)

- **Round 1:** 16 findings. The ones that mattered:
  - **#1:** the JPEG stripper copied everything after the first scan, so GPS hidden between
    progressive scans or in an after-EOI trailer (iPhone gain maps, Pixel motion photos) survived.
    It now walks every segment and stops at EOI. All 48 real photos still decode (sips + ffmpeg).
  - **#2:** "sign up with a crewmate" let someone you'd blocked join your table group. Groups now
    need an invite and are block-checked, and the seating splits any group holding a blocked pair.
  - **#3:** on Supabase, users' own JWTs could call the RPCs directly and forge `p_now`, walking the
    clock past the rate limit. `nc_now()` clamps it unless the PGlite shim allows it, EXECUTE is
    revoked from PUBLIC, and ADR 0009 says clients never talk to Postgres directly.
  - **#4:** a join-code oracle (409 vs 404) whose attempts weren't counted. Fixed.
  - Smaller: prod config failed open into mock; City "leave" revoked nothing; tossed shots 404'd in
    the album and broke Save all; races hidden by single-connection PGlite (row locks + a locked
    roll trigger now); reports didn't hide from the reporter; ownerless crews; FK errors → 500 and
    an existence oracle; spoofable XFF; buffered uploads; tz validation; stale `useApi` responses;
    on-device image caches outliving a hide.
- **Round 2:** signed off for M1 in mock mode. Its follow-ups are fixed too: rightmost-XFF /
  socket key, re-entering your own code, a leaver's photos leave with them, default privileges.
- **Lesson:** every serious finding was a place where a _promise_ (no location, blocks mean
  never together, rate limit) depended on one layer. Where we had two layers (core + RLS, server
  strip + `exif: false`), the review found nothing.

## 2026-10-28 — Milestone 1 reviews: privacy & safety reviewer (round 1: no sign-off)
- **It was right:** the prototype had consent *mechanics* but the safety tools weren't where the
  threat is. There was no Block on a person outside City tables, no host "remove from tonight",
  and removals were deferred to the morning as if they were drunk regret. Reports went nowhere
  and the evidence could be deleted. One report could trap the reported person in the app (a
  check constraint failed on deletion). A blocked crewmate saw the venue of your night, and could
  lock you out of a night by joining first. Night links forwarded forever. Subjects could only
  veto after everyone had seen the photo.
- **Fixed (0011 + API + mobile + 22 regression tests):**
  - Block/Report/Remove one tap from every face.
  - Host remove + code rotate, never deferred.
  - Evidence hold + hash denylist + under_18/under_21 split + dev moderation queue.
  - Reports survive deletion.
  - Night details masked for non-participants, and blockers are never locked out.
  - Links are host/crew-only, capped at 10, with revoke; hosts are notified of code joins.
  - Subjects tagged during the morning review get a private preview and veto.
  - Nudges respect blocks/mutes. City leave is safe, there's a hard lone-woman rule, silent tag
    no-ops, deletion hides photos you're in, a PNG allowlist, a real 21+ profile route, and
    honest copy.
- **Bug I caught while fixing:** `nc_is_host()` returned NULL for non-members, and `not NULL` lets
  a guest through. All host checks are coalesced now, with a DB test proving a guest can't remove,
  rotate or mint links.
- **Decision:** "remove a member" moved from *deferred* to *safety* in DRUNK_UX. The original
  research treated it as regret; the review showed it's usually the opposite at 1am.
