# CLAUDE.md — NightCap

**NightCap: the album from last night.** Friends snap photos into one shared roll while they're
out. Nobody sees anything until the morning after, when the album *develops* and everyone gets the
whole night at once. BeReal for drunk people: friends-only, nothing posts by accident, and you get
the photos the morning after without the "send me those" chase.

Pillars: (1) the night album (crew → night → shared roll → morning unlock), (2) effortless sharing
with whoever you went out with (code / QR / link, auto-grouping), (3) long-distance crews for old
college friends (weekly Nightcap moment, recaps, gentle nudges), (4) City Nights: opt-in, safety-first
ways to meet people in your city, (5) drunk-proof UX and consent for everyone in the photos.

Sister app: `~/Desktop/NightOut` (anonymous venue feeds). Same stack family, **separate app, repo and
bundle id** (`com.lachlanspangler.nightcap`). See "Running alongside NightOut".

## Start every session like this
1. `make doctor` (self-healing checks). Anything red comes first.
2. Read the top of `docs/STATUS.md` and the last ~3 entries of `docs/DIARY.md` (newest at bottom).
3. `make ideas-next` for the highest-scoring open ideas.
4. Run the loop in `docs/WORKFLOW.md`. Don't stop to ask what you can decide: pick the sensible
   default, write why in the diary, keep going. The only blockers are things only the user can give
   (keys, accounts). Stub them, list them in STATUS → "Needs from you", move on.

## Running alongside NightOut (hard rules)
Another Claude session builds `~/Desktop/NightOut` on this laptop with its own simulator, Metro and
builds. The laptop has crashed from overload before.
- **One agent.** No parallel sub-agents. Review agents run one at a time, only while we're idle.
- **`~/Desktop/NightOut` is read-only.** Read it to learn; never edit, build, test, install or run in it.
- **Our simulator only:** `NightCap iPhone` (created with `scripts/sim.sh create`; the UDID lives in
  `.sim-udid`, gitignored). Only ever boot / install / screenshot / record / shut down / erase *that*
  UDID. Never `simctl shutdown all`, never touch other devices, never quit Simulator.app.
- **Our ports:** Metro/Expo **8091** (never 8081), API **8788**, local Supabase (if ever run) on
  **54421–54429** with `project_id = "nightcap"` (`supabase/config.toml`). All in `.env.example`.
- **Never stop, kill or prune** processes, docker containers, volumes or caches we didn't start. No
  `killall node`, no `docker system prune`, no global cache clears, no DerivedData deletes for other
  projects. We stop our own servers by the PIDs in `.run/*.pid` (`make stop`).
- **Heavy jobs** (xcodebuild, pod install, expo run:ios, maestro, full e2e, big installs): run
  `scripts/wait-for-quiet.sh` first. It waits until no xcodebuild/sim build runs and the 1-min load
  ≤ cores. **One heavy job at a time, ever.** Do light work while waiting.
- Order work light → heavy: research, design, data model, pure logic + unit tests before simulator work.
- Commit after every item, small commits, so a crash loses nothing. Never push.
- At the end: shut down only our simulator and the servers we started.

## Commands
| | |
|---|---|
| `make setup` | one command: deps, `.env` from `.env.example` (dev secrets generated), demo photos, git hooks |
| `make check` | typecheck + lint + format + all tests (core, db/RLS, api, mobile) + ledger sync + doctor. Run before every commit |
| `make test` | all test suites without lint |
| `make api` | API on :8788 in mock mode (PGlite + local media), seeded demo data |
| `make metro` | Expo/Metro on :8091 |
| `make demo` | API + Metro in the background (PIDs in `.run/`), boots our sim, opens the app |
| `make stop` | stops only what `make demo` started |
| `make sim-shot NAME=x` | screenshot our simulator → `docs/media/x.png` |
| `make maestro` | waits for quiet, then runs `.maestro/` flows against our simulator |
| `make doctor` / `make heal` | self-healing checks / plus safe automatic repairs |
| `make ideas` / `make ideas-next` | regenerate `docs/IDEAS.md` from the ledger / top open ideas |

Node 20.19+ (`.nvmrc`). `.npmrc` pins the public npm registry (the machine default is the corp
registry, which needs Midway). Expo SDK 54 (SDK 55+ needs Node 22). Vitest 3 (newer needs Node 22).

## Architecture
```
packages/core/     PURE domain logic. No I/O, no Date.now(), no Math.random (ESLint-enforced).
                   clock.ts (injected Clock), time.ts (tz-aware local-time math), night.ts (phases,
                   unlock timing), roll.ts (exposures), album.ts (visibility + album assembly),
                   permissions.ts, consent.ts (tags/hide), invites.ts (codes/tokens), moments.ts
                   (weekly Nightcap), recaps.ts, nudges.ts, city.ts (City Nights tables + safety),
                   drunk.ts (night-mode, undo windows, "ask me in the morning"), age.ts (21+)
packages/db/       SQL migrations (source of truth) + PGlite harness + RLS tests.
                   migrations/0000_supabase_shim.sql makes PGlite look like Supabase (auth.uid(),
                   anon/authenticated/service_role); it is skipped on real Supabase.
apps/api/          Hono API (:8788). Every user request runs in a transaction as `authenticated`
                   with request.jwt.claims set, so Postgres RLS is the real gate. Media store
                   (local disk in mock, R2 in prod), EXIF stripping, signed media URLs, dev routes
                   (time travel, switch user, simulate friends) only in mock mode.
apps/mobile/       Expo SDK 54 + expo-router app. Night palette → dawn palette on unlock.
.maestro/          Maestro flows for the core loop (run on our sim via Expo Go).
supabase/          config.toml for a local Supabase stack (project_id nightcap, ports 54421+).
scripts/           wait-for-quiet.sh, sim.sh, doctor.mjs, ideas.mjs, gen-photos.mjs, dev env tools
docs/              WORKFLOW STATUS DIARY IDEAS ideas_ledger.json adr/ research/ media/ reviews/
```
Data flow: mobile → API (JWT) → `withUserTx` (role authenticated + claims) → SQL, RLS-checked.
Time-based transitions (night auto-end, unlock) are computed by `@nightcap/core` with an injected
clock and persisted by the API (`advanceNight`); RLS checks only persisted state (`unlocked_at`),
never `now()`. That keeps time travel (dev) and tests deterministic.

## Rules that must stay true
1. **Nothing is visible to anyone else before the night unlocks.** Authors see their own shots;
   others see counts only. Enforced in core (`album.ts`) *and* RLS (`shot_select` policy).
2. **Friends-only by default.** A night album is visible only to people who joined that night.
   Nothing is ever public. There is no public profile, no follower graph.
3. **No location leaks.** No GPS is stored with shots; EXIF/XMP is stripped server-side before
   storage (`apps/api/src/media/exif.ts`); venue is an optional free-text label.
4. **Consent for people in photos.** Anyone tagged can untag or hide the photo from the album
   ("that's me, hide it") with one tap; hides win over the author. Blocks are mutual-invisibility.
5. **Nothing permanent by accident.** Destructive actions are hold-to-confirm with an undo window;
   during night mode, irreversible actions are deferred to the morning ("ask me in the morning").
6. **21+ only.** DOB gate at sign-up (ID verification is stubbed, see ADR). City Nights require it.
7. **Secrets never in the bundle or git.** Mobile only gets `EXPO_PUBLIC_API_URL`. Missing keys →
   mock mode, documented in STATUS.
8. **Demo data is demo.** Seeded users/crews/nights are flagged `is_demo` and only load in mock mode.

## Conventions
- TypeScript strict everywhere. Zod at the API boundary. Pure core functions, injected clocks.
- Tests first for rules (night timing, visibility, consent, permissions); RLS tests for every table.
- Commits: small, one logical change, prefixes `core:` `db:` `api:` `mobile:` `test:` `docs:`
  `build:` `research:` `design:`, plus the idea id when there is one (`I-012: …`). Never push.
- Big decisions get an ADR in `docs/adr/NNNN-title.md`.
- Diary: append a dated entry at the bottom of `docs/DIARY.md`: what changed, what broke, what you
  decided and why, what it felt like on the simulator.
- Ideas: add with `node scripts/ideas.mjs add …`; record rejected ideas with a reason; ≥3 new per loop.
- Inclusive language (allowlist/denylist, primary/replica).
- Verify by running: after any UI change, run it on our simulator, screenshot it, look at it.

## Gotchas
- Corp npm registry is the machine default → `.npmrc` pins the public one.
- NightOut uses Metro 8095 and its own sim; never reuse its ports or devices.
- Disk was ~31 GB free at kickoff: prefer Expo Go over a full dev build (ADR 0007).
