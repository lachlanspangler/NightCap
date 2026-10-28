# Architecture Decision Records

One file per decision: `NNNN-title.md` with Status, Context, Decision, Consequences.
`make doctor` fails if an ADR isn't listed here.

| #                                        | decision                                                   | status   |
| ---------------------------------------- | ---------------------------------------------------------- | -------- |
| [0001](0001-stack.md)                    | Stack: Expo + Hono + Postgres/Supabase + R2                | accepted |
| [0002](0002-pglite-and-rls.md)           | PGlite + Supabase shim; RLS on every request               | accepted |
| [0003](0003-night-lifecycle.md)          | Night lifecycle and unlock timing                          | accepted |
| [0004](0004-consent-model.md)            | Consent model for people in photos                         | accepted |
| [0005](0005-auth-and-mock-mode.md)       | Auth and mock mode                                         | accepted |
| [0006](0006-media-pipeline.md)           | Media pipeline: EXIF strip, signed URLs                    | accepted |
| [0007](0007-expo-go-on-our-simulator.md) | Verify on our own simulator via Expo Go                    | accepted |
| [0008](0008-visual-identity.md)          | Visual identity: darkroom at night, sunrise in the morning | accepted |
