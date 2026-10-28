# ADR 0008: Visual identity: "darkroom at night, sunrise in the morning"

**Status:** accepted · 2026-10-28

## Context

NightCap has to feel amazing in the hand at 1am in a dark bar (DRUNK_UX) and at 10am in bed with a
hangover. The emotional peak is the morning reveal. The sister app NightOut is neon and map-first,
so NightCap needs its own feel.

## Decision

- **Two palettes, one app.** _Night_ (live + developing): ink background `#0C0A14`, plum surfaces,
  cream text `#F7EFE2`, **amber safelight** accent `#FFB44D` (the darkroom's safe light: the colour of
  "developing"). _Dawn_ (an unlocked album): peach → pink → lilac sunrise gradient, ink text. When an
  album unlocks, the screen literally goes from night to dawn.
- **Type:** Fraunces (soft, warm serif; SIL OFL via @expo-google-fonts) for display moments: crew
  names, "Developing…", big numbers like the shot counter and the night code. Inter for UI.
- **Undeveloped film:** shots you can't see yet are amber "film" tiles with grain and a frame number
  (like contact-sheet frames), never blurred versions of the real photo (those would leak content).
- **The shutter:** one 96pt amber ring at the bottom centre, a heavy haptic and a white flash. The
  counter ("17 left") is big Fraunces numerals.
- **Night mode** (DRUNK_UX): every interactive element ≥ 56pt, the primary one ≥ 88pt, one primary
  action per screen, hold-to-confirm for destructive actions, 8s undo.
- **Contrast:** night text pairs ≥ 7:1 (AAA), dawn text pairs ≥ 4.5:1. `theme.test.ts` enforces it.
- **No logos of other apps, no stock photos.** Demo photos are generated (scripts/gen-photos.mjs).

## Consequences

- Two token sets to keep in sync (one file, `apps/mobile/src/theme.ts`, tested).
- Fraunces + Inter load at startup (expo-font). The splash covers the load.
