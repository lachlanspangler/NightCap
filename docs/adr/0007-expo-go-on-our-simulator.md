# ADR 0007: Verify on our own simulator via Expo Go first

**Status:** accepted · 2026-10-28

## Context

Shared laptop: NightOut runs xcodebuild + its own sim. Disk had ~31 GB free. A dev build costs
several GB of DerivedData + Pods, plus long xcodebuild runs that compete with NightOut.

## Decision

- Create a dedicated simulator `NightCap iPhone` (iPhone 17 Pro, iOS 26.5 or newer) with
  `scripts/sim.sh create`, store its UDID in `.sim-udid`, and only ever address it by that UDID.
- Run the app in **Expo Go** on that simulator (`exp://127.0.0.1:8091`). Everything we use is in
  Expo Go 54. Maestro drives Expo Go with `openLink`.
- `app.json` still declares our own bundle id `com.lachlanspangler.nightcap` for a dev build
  later (`make ios-dev-build`, gated by wait-for-quiet).
- The simulator camera has no feed, so in mock mode the camera screen uses a **dev viewfinder**
  that cycles procedurally generated night photos (`scripts/gen-photos.mjs`), uploaded through the
  same real API path.

## Consequences

- Screenshots show Expo Go's dev chrome only if the dev menu opens, so we keep it closed.
- The custom icon/splash only show in a dev build.
