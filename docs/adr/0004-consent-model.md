# ADR 0004: Consent model for people in photos

**Status:** accepted · 2026-10-28

## Context
Most night photos are of other people (THE_NIGHT). Poparazzi shut down partly over consent. The
rules in docs/research/PRIVACY_SAFETY.md need one precise definition shared by core, SQL and UI.

## Decision
A shot is visible to viewer V iff:
1. V is the author, **or**
2. all of: V is a participant of the night; the night is unlocked; the shot is `released` (not
   discarded/deleted); the shot is not hidden (no active hide); there's no block in either direction
   between V and the author; V hasn't reported it (auto-hide for the reporter).
Hides: any participant may hide a shot "that's me" (or as the tagged subject). A hide hides the shot
from everyone but the author. Only the hider can lift their own hide. The author sees "hidden by
someone in it" and can delete but can't un-hide. Tags start `pending` (visible only to the tagged
person and the tagger), self-tags are `approved`, and untag sets `removed`. Subject-category reports
(`in_photo`, `nudity`, `minor`) also create a hide.

`packages/core/src/album.ts → canSeeShot()` and the SQL function `nightcap.can_see_shot()` implement
the same predicate. A shared table-driven test fixture is run against both.

## Consequences
- Hides are powerful by design (a subject can veto). Abuse (hiding every photo) only removes content,
  never exposes it, which is the safe failure mode.
- The author keeps their own copy view, so authors aren't surprised by disappearing work.
