# WORKFLOW — the NightCap loop

Every session, every item, run the same loop. It's built so that a crash, a context reset or a new
agent can pick up exactly where the last one stopped.

```
 doctor → pick idea → plan → build → test → verify for real → diary/status → new ideas → commit → repeat
```

## 0. Doctor (self-healing)

`make doctor` runs `scripts/doctor.mjs`. It checks, and `make heal` repairs what is safe to repair:

| check                                                                                  | heal                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------ |
| `.env` exists and has every key in `.env.example`                                      | copy missing keys, generate dev secrets    |
| ideas ledger valid JSON, ids unique, scores in range, `IDEAS.md` in sync               | regenerate `IDEAS.md`                      |
| every ADR linked from `docs/adr/README.md`                                             | regenerate the index                       |
| no secrets in tracked files (`sk_`, `service_role`, private keys, JWT-looking strings) | — (red, fix by hand)                       |
| mobile bundle env only `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_MOCK`                      | — (red)                                    |
| ports in `.env.example` match CLAUDE.md (8091, 8788, 54421+)                           | —                                          |
| `.run/*.pid` point at live processes we started                                        | remove stale pid files                     |
| our simulator UDID (`.sim-udid`) still exists                                          | — (re-create with `scripts/sim.sh create`) |
| demo photos generated                                                                  | `node scripts/gen-photos.mjs`              |
| migrations numbered contiguously, each has an RLS test                                 | —                                          |
| DIARY has an entry for today if there were commits today                               | — (warn)                                   |

Red = stop and fix first. Amber = fix this loop. Green = go.

## 1. Pick

`make ideas-next`. Take the highest-scoring open idea that fits the current phase (STATUS →
"Now"). Phase order is fixed: core loop → sharing → old-friend crews → City Nights → polish. A
bug, a red doctor check or reviewer feedback beats any idea.

Score = `impact × confidence ÷ effort`, each 1–5, plus `+2` if it's on the critical path of the
demo. Rejected ideas stay in the ledger with a reason, so we don't relitigate them.

## 2. Plan

Write 3–8 lines in the diary _before_ coding: what changes, which layers (core / db / api /
mobile), which tests prove it, what "verified for real" means for this item. If the decision is
big or hard to reverse, write an ADR first.

## 3. Build

Light → heavy. Pure core logic first with its tests, then SQL + RLS tests, then the API route +
tests, then the screen + its RNTL test. Keep each commit to one logical change.

## 4. Test

`make check` must be green. Every layer has its own tests:

- **core** (Vitest): unlock timing incl. DST, phases, visibility, permissions, consent, invites.
- **db** (Vitest + PGlite): migrations apply from scratch; RLS denies/permits per role and per
  relationship (member, non-member, blocked, author, tagged, before/after unlock).
- **api** (Vitest + Hono `app.request`): every route, authz failures, validation, rate limits.
- **mobile** (jest-expo + RNTL): screens render the right state for each phase; big targets.
- **e2e** (Maestro): the core loop on our simulator.

## 5. Verify for real

Run it. `scripts/wait-for-quiet.sh` first if it's heavy. On our simulator (`NightCap iPhone`,
`.sim-udid`), walk the flow as each of the three demo friends, screenshot each new screen to
`docs/media/`, and _look at the screenshots_. Write what felt good and bad. A green test suite with
an ugly or confusing screen is not done.

## 6. Diary + status

Append to `docs/DIARY.md` (dated, newest at bottom): what changed, what broke, what you decided
and why, what it felt like. Update `docs/STATUS.md` → "Built", "Now", "Next", "Needs from you".

## 7. New ideas

Add at least 3 ideas to the ledger (`node scripts/ideas.mjs add`) from what you just learned,
including ones you'd reject (reject them with a reason right away). `make ideas` regenerates
`docs/IDEAS.md`.

## 8. Commit

`make check`, then commit (small, prefixed, idea id). Never push.

## Milestones and reviews

At each milestone (vertical slice; sharing; old friends; City Nights; final), when idle, run **one
review agent at a time**, never in parallel with a heavy job:

1. **Design critic**: looks at `docs/media/` screenshots + the clip, judges feel, hierarchy, drunk-proofness.
2. **Code reviewer**: reads the diff since the last milestone for correctness, tests, simplicity.
3. **Privacy/safety reviewer**: reads PRIVACY_SAFETY.md + RLS + API + screens; tries to break consent,
   visibility, location, age and blocking rules.
   Each writes `docs/reviews/<milestone>-<role>.md`. Fixes land as their own commits, then the reviewer's
   sign-off is recorded in the review file.

## Running alongside NightOut

See CLAUDE.md. One agent, our sim by UDID, our ports, never kill what we didn't start, wait for
quiet before heavy jobs, one heavy job at a time.
