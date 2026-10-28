# STACK: what NightCap is built on, and why

**Default (from the brief): same as NightOut.** That's Expo/React Native, Hono, Supabase
(Postgres + Auth + RLS) and Cloudflare R2. The research below checks each piece against NightCap's
needs and this machine's constraints. Verdict: **keep the NightOut stack**, with three local-dev
adaptations. ADR 0001.

## Requirements that drive the stack

1. A real camera on iOS (and Android later), haptics, the share sheet and camera-roll save.
2. Strict, testable privacy rules: visibility depends on membership, unlock state, hides and
   blocks. We want the database to enforce them (RLS), not just the API.
3. Time-dependent behaviour (unlock at 10:00 local, DST-safe) that's deterministic in tests and
   time-travelable in a demo.
4. Media: private by default, short-lived signed access, EXIF stripped, zero egress cost at scale.
5. **This laptop:** Node 20, no Docker, ~31 GB free disk, a sibling project running heavy iOS
   builds. One heavy job at a time.
6. A demo that works with **no keys at all** (mock mode).

## Client: Expo SDK 54 + React Native 0.81 + expo-router ✅

- Same as NightOut, so patterns and lessons transfer (jest-expo + RNTL, Maestro).
- Why not SDK 58 (current)? Its engines field requires Node ≥ 22.13. The machine has Node 20.20.
  SDK 54 supports Node 20.19+.
- Why not native Swift? Cross-platform matters (friend groups are mixed iPhone/Android: the
  shared-album failure in LANDSCAPE). Expo gives us both.
- Libraries: `expo-camera` (capture), `expo-haptics`, `expo-image` (fast cached images with
  headers), `expo-media-library` (save all), `expo-sharing`, `react-native-reanimated` (develop
  animation), `react-native-svg` (QR + icons), `expo-linear-gradient`, `expo-blur`,
  `@expo-google-fonts/*` (type), `expo-secure-store` (token), `zod` (shared schemas).
- **Run target: Expo Go on our own simulator** for verification (no xcodebuild of our own, a few
  hundred MB instead of a multi-GB dev build). Everything we use ships in Expo Go 54. A dev build
  (`expo run:ios`) stays possible for the bundle id, icon and splash (ADR 0007).
- QR: generate with `qrcode` (pure JS) → SVG. Scanning uses `expo-camera`'s barcode scanner.

## API: Hono on Node ✅

- Same as NightOut. `createApp(deps)` takes injected dependencies (db, clock, media store, auth)
  so tests call `app.request()` in-process. Zod validation via `@hono/zod-validator`-style helpers.
- Port **8788**.

## Data: Postgres (Supabase in prod) ✅, with PGlite for local/test ⚠️ adaptation

- Supabase gives Postgres + Auth + RLS. RLS is exactly the right tool for "who can see this shot".
- **No Docker here**, so `supabase start` (which needs Docker) is out. The options:
  1. In-memory fakes in the API: fast, but RLS goes untested. ❌
  2. A remote Supabase project: needs keys/accounts from the user and the network. ❌ for now
  3. **PGlite** (`@electric-sql/pglite`): real Postgres compiled to WASM, in-process, no Docker,
     supports roles, `SET ROLE`, RLS, plpgsql, `set_config`. ✅
- We run the **same SQL migrations** on PGlite (dev/test) and Supabase (prod). A shim migration
  (`0000_supabase_shim.sql`, PGlite-only) creates `auth.users`, `auth.uid()` (reads
  `request.jwt.claims` like Supabase), and the `anon` / `authenticated` / `service_role` roles.
- The API runs each user request in a transaction: `set local role authenticated;
select set_config('request.jwt.claims', …, true)`. That's exactly what Supabase's PostgREST does,
  so RLS is exercised on every request, in tests and in the demo.
- Prod driver: `postgres` (porsager) over `DATABASE_URL`. It's behind the same `Db` interface as
  PGlite. Only the adapter differs.
- `supabase/config.toml` is committed with `project_id = "nightcap"` and ports 54421–54429, so a
  future `supabase start` never collides with NightOut or defaults.

## Auth: Supabase Auth (prod) / dev JWTs (mock) ✅

- Prod: Supabase phone OTP or Sign in with Apple. The API verifies Supabase JWTs with
  `SUPABASE_JWT_SECRET`.
- Mock: the API mints HS256 JWTs with the same shape (`sub`, `role: authenticated`) signed with
  `DEV_JWT_SECRET` (generated per machine by `make setup`, gitignored). The sign-in screen offers
  the demo friends plus "new account" (name + DOB). One code path verifies both.

## Media: Cloudflare R2 (prod) / local disk (mock) ✅

- R2 means zero egress and S3-compatible presigned URLs (same as NightOut).
- In the prototype the client uploads a multipart image to the API, which **strips EXIF** and then
  writes to the `MediaStore` (disk in mock, R2 in prod via S3 API). It's simpler than presigned
  PUTs, and it guarantees stripping happens before storage. At scale we'd move to a presigned PUT
  plus an async strip/transcode worker (like NightOut's pipeline).
- Reads: `GET /media/:shotId?u=&exp=&sig=` with an HMAC over (shot, viewer, exp). The API checks
  the signature, and the shot's visibility was already checked (RLS) when the URL was issued.
  In prod, R2 presigned GETs fill the same role.

## Language & tooling ✅

- TypeScript 5.9 strict everywhere, npm workspaces (`packages/*`, `apps/*`).
- Vitest 3 for core/db/api (Vitest 4 needs Node 22). jest-expo 54 + RNTL for mobile screens.
- ESLint 9 flat config + Prettier. ESLint bans `Date.now`, `new Date()` without args and
  `Math.random` in `packages/core` (determinism, injected clock).
- Maestro for e2e on our simulator.
- `make setup` / `make check` / `make doctor` (like the sister projects).

## What we'd change at scale (not now)

- A push notifications service (Expo push), real-time (Supabase Realtime) for live shot counts.
  The prototype polls every 10 s.
- Media worker: thumbnails (WebP variants), video, CSAM/NCII hash matching.
- Job runner for unlocks at scale. The prototype advances nights lazily on read plus a 30 s ticker.
