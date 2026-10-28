# ADR 0009: Clients never talk to Postgres; the database doesn't trust client time

**Status:** accepted · 2026-10-28 (from code review M1 #3)

## Context

RPCs take `p_now` from the API's injected clock, which keeps tests deterministic and makes dev
time travel possible. On Supabase, though, every user holds a Supabase JWT, and PostgREST serves
the `public` schema. A user could call `/rpc/join_night_by_code` directly with a forged `p_now`
and walk the clock forward to dodge the code-guess rate limit. They could also probe helpers
like `blocked_either(a, b)` for arbitrary users.

## Decision

1. **Clients only ever talk to the NightCap API.** In Supabase, set _Exposed schemas_ to none
   (or a dedicated empty `api` schema). The API connects with `DATABASE_URL` and switches role
   per request (ADR 0002). This is a deployment checklist item (STATUS → Needs from you).
2. **Defense in depth inside the DB (migration 0007):** every `p_now` is clamped to `now() ± 2 min`
   by `nc_now()`. The only exception is `nc_clock_override_allowed()`, which returns true only in
   the PGlite shim (0000). `EXECUTE` is revoked from `PUBLIC` and `anon` on every function.
3. Wrong-code joins return a value instead of raising, so the attempt row always commits, and
   every join failure maps to the same `unavailable` (code review #4).

## Consequences

- Mock mode keeps time travel. On Supabase, server time wins, as it should.
- A test simulates the Supabase setting (override false) and proves the rate limit holds.
