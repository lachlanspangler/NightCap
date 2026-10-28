# ADR 0003: Night lifecycle and unlock timing

**Status:** accepted · 2026-10-28

## Context
The core loop is: start a night → shared roll → morning-after unlock. Timing has to feel natural
(people wake 9am–1pm), resist drunk decisions, and stay DST-safe across time zones.

## Decision
Phases (computed by `packages/core/src/night.ts → nightPhase(night, now, members)`):
- **live**: from `started_at` until `ended_at` (manual) or `auto_end_at`. Capture allowed (24 per person).
- **developing**: ended, not unlocked. Authors review their own shots (keep/toss) and can tap "I'm good".
- **unlocked**: `unlocked_at` is set. Released shots are visible to participants.

Timing (all in the night's IANA `tz`):
- `auto_end_at` = the first local **05:00** after start, capped at start + 12h.
- `unlock_at` = the first local **10:00** that is at least **6h after start** (and ≥ auto_end).
- `earliest_unlock_at` = the first local **07:00** after start, and ≥ auto_end. Early unlock happens
  when every participant has a `ready_at` that is **≥ earliest_unlock_at** (the sober check) and
  now ≥ earliest_unlock_at.
- Moments (`kind = moment`, the weekly Nightcap): a window `[opens_at, closes_at)`, roll = 1. They
  unlock when every member has posted, or at `closes_at`.
- City nights (`kind = city`): the same as `night`.
- Local-time math uses `Intl.DateTimeFormat` offsets with a two-pass correction (no tz library);
  tests cover the spring-forward and fall-back nights in America/Chicago and Europe/London,
  plus UTC+13.

Unreviewed shots are **kept** by default at the unlock (THE_NIGHT.md); discarded shots are never
released. One live night per crew, and one live night per person.

## Consequences
- The persisted state (`ended_at`, `unlocked_at`) is written by `advanceNight` (on read and by a
  30 s ticker). RLS reads only that.
- Changing these constants changes everyone's mornings, so they live in one `NIGHT_RULES` object
  with tests.
