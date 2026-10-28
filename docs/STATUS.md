# Status

## Final state (milestone 1: strong prototype) — 2026-10-28

**NightCap: the album from last night.** Friends snap into one shared roll while they're out. Nobody
sees a thing until the morning, when it develops for everyone at once. Everything is committed on
`main` in a new local repo. Nothing is pushed.

**All green:**

- `make check`: typecheck, ESLint, Prettier, the ideas ledger, doctor, and these tests:
  - core: domain logic, DST, seeded fuzz
  - db: migrations + RLS on real Postgres via PGlite
  - api: every route, plus the privacy regression suite
  - mobile: jest-expo screen tests
- **Maestro, on our own simulator (`NightCap iPhone`, iOS 26.5, Expo Go):** all six flows pass:
  core-loop, sharing, old-friends, on-this-night, city, consent.
- **Reviews, all signed off after their fixes landed:**
  - design critic (round 2)
  - code reviewer (round 2)
  - privacy & safety reviewer (round 3)

  See `docs/reviews/`.

**Media:**

- `docs/media/core-loop.mp4`: the whole loop on the simulator, 3:08.
- Screenshots:
  - core loop: `core-01…12`
  - sharing: `share-*`
  - old friends: `friends-*`
  - City Nights: `city-*`
  - consent: `consent-*`

## Built

- **The night album (core loop):**
  - Crew → _Start a night_ (one tap; the crew gets pinged) → everyone snaps (a 24-shot roll, one
    huge shutter, nobody sees anyone's shots).
  - Hold to end (or it auto-ends at 5am).
  - _Developing…_: a 3am "Get some sleep" (approvals before 7am don't count).
  - The morning review: toss/keep with undo, and tag who's in it. Subjects get a private look and
    can veto.
  - "I'm up. I'm good." → it reveals early once everyone's up, or at 10:00.
  - _Hold to develop_: the sky goes ink→dawn and each frame develops in time order. Hour dividers,
    Save all, Tell the group.
  - Reactions in the viewer.
  - All timing is DST-safe local time (ADR 0003).
- **Effortless sharing:**
  - A 4-digit code you can say across the bar, plus a QR and a link (host/crew only, capped,
    revocable, rotate-able).
  - Guests see only that night. Hosts see who joined by code, and can remove (a ban) in one hold.
  - Deep links `nightcap://join/<token>`.
- **Old college friends:** long-distance crews with a weekly _Nightcap_ moment (one shot each,
  reveals when everyone's in), reunion countdown, "1 year ago tonight", month in review, and gentle
  nudges (never about someone you blocked or who muted; no streaks).
- **Meet people in your city (City Nights):**
  - Opt-in + code of conduct + 21+ (ID check stubbed).
  - Small tables at public bars, formed 2h before.
  - Groups only by invite, blocked pairs never together, and nobody who came alone is the only
    non-man at a table.
  - A shared table roll.
  - Keep in touch only on a mutual yes; share-my-plan; block and report any tablemate; leave safely.
- **Drunk-proof UX:**
  - Night mode (bigger targets, tested ≥56/88pt) and hold-to-confirm.
  - Undo toasts (8s at night).
  - "Ask me in the morning" for irreversible social actions (leaving a crew, deleting your account).
    Safety actions (block, report, remove) never wait.
- **Privacy & consent:**
  - Visibility is enforced in core _and_ RLS from one shared fixture.
  - Hide-me wins over the author and outlives the hider's account.
  - Opt-in tags.
  - Mutual-invisibility blocks (a blocker is never locked out).
  - Reports are evidence (hold + hash denylist + under-18/under-21 split).
  - GPS/EXIF/XMP/trailers stripped from JPEGs, and an allowlist for PNG chunks.
  - Signed, no-store media URLs re-checked on every fetch.
  - Deleting your account takes your photos and your face with you.

## How to run the demo

```bash
cd ~/Desktop/NightCap
make setup              # once: deps, .env with dev secrets, 48 generated night photos
scripts/demo.sh start   # API :8788 + Metro :8091 + boots "NightCap iPhone" + opens Expo Go
```

1. **Welcome:** tap **Maya** (or Theo / Jules).
2. **Night Owls → Start a night:** you land in the camera. Snap a few.
3. **DEV tab (left edge):**
   - **Friends join + snap 3 each** fills the roll.
   - **Code** (top right) shows the QR, the code and the link.
4. **Wrap up → hold:** the night ends.
5. **Developing…:**
   - **DEV → Skip to 7:05 AM**, then **Look through my shots** (toss one, tag a friend).
   - **I'm up. I'm good.**, then **DEV → Everyone else taps "I'm good"**.
6. **Hold to develop:** the reveal.
7. Also try:
   - Carleton '22 (weekly Nightcap, reunion, recaps)
   - **City Nights** tab → Trivia Table → Save me a seat → DEV +1 hour (table reveal)
   - **You're in 2 photos** on Home (consent)
   - **DEV → act as Priya** + Join a night (sharing by code)

Hands-free: `make maestro` runs every flow. Stop everything with `scripts/demo.sh stop` (and
`scripts/sim.sh shutdown`). `make reset-db` wipes the mock DB. For clean screenshots, open
`exp://127.0.0.1:8091/--/devtools?chrome=0` to hide the DEV tab.

## Needs from you

- **"Timeshare"** (from the brief): which app did you mean? I couldn't find a photo/friends app by
  that name, so LANDSCAPE.md covers the category instead.
- **For a real (non-mock) build:**
  - A Supabase project (URL, JWT secret, `DATABASE_URL`), with **PostgREST exposure of `public`
    turned off** (ADR 0009).
  - Cloudflare R2 keys (`R2Store` is a stub).
  - Phone/Apple sign-in (Supabase Auth; `POST /me/profile` already enforces 21+).
  - An ID-verification provider (Persona / Stripe Identity / Yoti).
  - The `nightcap.app` domain (links/QR point at a placeholder).
  - An Apple developer team for a dev build on your phone (I used Expo Go to keep this shared laptop
    light, ADR 0007).
- **Before real users (from the privacy review):**
  - a real moderator console with SLAs, under-18 escalation (NCMEC) and StopNCII/PhotoDNA hashing;
  - evidence-store access control + retention;
  - block evasion via new accounts (device/phone binding);
  - the under-21 instant-retry flag.

## Known, small

- A blocked person can still learn a crew night exists from the "there's already a night going"
  409 (one live night per crew).
- A subject who previewed a tagged shot has seen it even if the author tosses it later.
- On release, the contact sheet re-lays out into the grid rather than developing in place (I-084).
- Demo "friends snap" posts each friend's shots in a burst (I-088).

## Next (top of `make ideas-next`)

Spread demo shots across the night (I-088), a "get home" button at night end (I-053), develop
frames in place (I-084), optional host approval for code joins (I-085), a dev build with our own
icon (I-080), push notifications (I-069), validating with 5 real friend groups (I-071).
