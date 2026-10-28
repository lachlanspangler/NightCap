# ADR 0005: Auth and mock mode

**Status:** accepted · 2026-10-28

## Context
The demo must run with zero keys. Prod uses Supabase Auth. NightOut's lesson: secrets prefixed
`EXPO_PUBLIC_` ship in the bundle.

## Decision
- One JWT verification path in the API (HS256): `SUPABASE_JWT_SECRET` in prod, `DEV_JWT_SECRET` in mock.
  `make setup` generates the dev secret into `.env` (gitignored). If it's missing at runtime the API
  generates an ephemeral random one and logs that tokens won't survive a restart.
- Mock mode (`NIGHTCAP_MODE=mock`, or any prod key missing) enables `/dev/*` routes: list demo
  users, mint a token for a demo user, sign up (name + DOB, 21+ gate), clock offset (time travel),
  simulate friends snapping, reseed. **These routes are not mounted** outside mock mode, and a test
  asserts that.
- The mobile app only reads `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_MOCK`. `make doctor` fails if
  any other `EXPO_PUBLIC_*` appears.
- Tokens are stored in `expo-secure-store`.

## Consequences
- A real phone-OTP/Apple sign-in needs a Supabase project (STATUS → Needs from you).
