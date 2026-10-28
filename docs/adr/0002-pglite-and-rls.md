# ADR 0002: PGlite with a Supabase shim for local dev and tests; RLS on every request

**Status:** accepted · 2026-10-28

## Context

Visibility rules (locked until unlock, friends-only, hides, blocks) must be enforced by the database
so an API bug can't leak a photo. Testing RLS needs real Postgres. There is no Docker on this
machine, so `supabase start` isn't available, and a remote project needs keys we don't have.

## Decision

- Use **PGlite** (Postgres 17 in WASM, in-process) for tests and mock mode.
- `packages/db/migrations/*.sql` are the source of truth for both PGlite and Supabase.
  `0000_supabase_shim.sql` (PGlite only, skipped when `NIGHTCAP_TARGET=supabase`) creates the
  `auth` schema, `auth.users`, `auth.uid()` / `auth.role()` (reading `request.jwt.claims` exactly
  like Supabase) and the roles `anon`, `authenticated`, `service_role`.
- The API runs every user request inside a transaction:
  `set local role authenticated; select set_config('request.jwt.claims', $claims, true)`. That's
  the PostgREST model, so RLS is the gate in the demo, the tests and prod alike.
- Privileged transitions (advancing night phases, redeeming invite tokens, joining by code) are
  `security definer` functions with narrow arguments, or run as `service_role` from the API's
  internal paths only.
- **Time never enters RLS.** Policies check persisted state (`nights.unlocked_at`), not `now()`.
  The API advances nights with core's pure `nightPhase(now)` and an injected clock, so tests and
  dev time travel stay deterministic.

## Consequences

- Fast hermetic DB tests (a fresh DB per test file in ~1 s), no Docker.
- PGlite is single-connection: the API serialises transactions in mock mode. That's fine for a
  demo, not a load test.
- Supabase-specific features (storage policies, realtime) aren't exercised locally.
