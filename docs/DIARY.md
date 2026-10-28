# Diary

Append-only. Newest at the bottom. Each entry: what changed, what broke, what I decided and why,
what it felt like.

## 2026-10-28 — Kickoff

- **Context read:** NightOut (Expo 54 / RN 0.81 / expo-router, Hono API with `createApp()` for
  in-process tests, Supabase + RLS, R2 media, Maestro smoke flow; SECURITY-TODO lesson: an `sk.`
  token prefixed `EXPO_PUBLIC_` shipped in the bundle → only public values ever reach the app).
  Game (Lagooner Beach), GetOffTheCouch and GameCred for the workflow shape: CLAUDE.md as an
  operating manual, WORKFLOW loop, append-only diary, JSON ideas ledger → generated IDEAS.md, ADRs,
  doctor/heal self-healing checks, STATUS with "needs from you".
- **Machine at kickoff:** load avg 41 on 14 cores, NightOut mid-`xcodebuild` (its Metro on 8095),
  disk 31 GB free (93% used). No docker, no supabase CLI, no maestro, no postgres. Node 20.20.
- **Decisions:**
  - `.npmrc` pins registry.npmjs.org: the machine default is the corp registry (401 without Midway).
  - Expo **SDK 54** (same as NightOut): SDK 58 is current but needs Node 22; the machine has Node 20.
  - No docker → no local Supabase stack. DB + RLS tests run on **PGlite** (real Postgres in WASM,
    in-process) with a small Supabase shim (auth.uid(), roles). ADR 0002.
  - Low disk + a busy neighbour → simulator runs use **Expo Go** (no xcodebuild of our own) first;
    a dev build is optional later. ADR 0007.
  - "Timeshare" from the brief: I couldn't verify an app by that name (web search only returns
    vacation timeshares). Covered the category instead, flagged in STATUS → "Needs from you".
