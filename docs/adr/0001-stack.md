# ADR 0001: Stack: Expo + Hono + Postgres/Supabase + R2 (same family as NightOut)

**Status:** accepted · 2026-10-28

## Context

The brief defaults to NightOut's stack unless research says otherwise. NightCap needs a real camera
on iOS/Android, strict DB-enforced visibility rules, deterministic time logic and private media.
The machine runs Node 20, has no Docker and is shared with NightOut's heavy builds (docs/research/STACK.md).

## Decision

- Mobile: **Expo SDK 54**, React Native 0.81, expo-router, TypeScript. SDK 58 needs Node 22.
- API: **Hono** on Node (`@hono/node-server`), `createApp(deps)` with injected db/clock/media/auth.
- Data: **Postgres**. Supabase in prod (Auth + RLS), PGlite locally (ADR 0002).
- Media: **R2** in prod, local disk in mock mode (ADR 0006).
- Monorepo with npm workspaces: `packages/core` (pure domain), `packages/db` (migrations + RLS
  harness), `apps/api`, `apps/mobile`.
- Vitest 3 for core/db/api, jest-expo + RNTL for mobile, Maestro for e2e.

## Consequences

- NightOut's patterns (createApp for in-process tests, public-keys-only bundle, Maestro) transfer
  directly. A separate repo, bundle id (`com.lachlanspangler.nightcap`) and ports.
- Pinned to SDK 54 until the machine moves to Node 22. Upgrading is mechanical (`expo install --fix`).
