# Status

## Now

Milestone 1 (vertical slice) verified on our simulator. Next: milestone reviews (design critic →
code reviewer → privacy/safety reviewer, one at a time), then widen + verify sharing, old-friend
crews and City Nights on the simulator.

## Built

- **Core loop, working on the simulator:** crew → start a night → everyone snaps (24-shot roll) →
  hold-to-end (or 5am auto-end) → developing (3am: "Get some sleep") → morning review (toss/keep) →
  "I'm good" (counts from 7:00) → early reveal when everyone's up, or 10:00 → the album develops
  (dawn palette) → photo viewer with reactions. Maestro: `.maestro/core-loop.yaml`. Clip:
  `docs/media/core-loop.mp4`.
- **Sharing:** 4-digit night code (keypad), QR + link (invite screen), crew invite links,
  guests see only that night, deep links `nightcap://join/<token>`.
- **Old friends:** long-distance crews, weekly Nightcap moment (1 shot each, reveal when all in),
  recaps (on this night, month in review), nudges, reunion countdown.
- **City Nights:** opt-in + code of conduct + 21+ (ID stubbed), tables formed 2h before at public
  venues, shared table roll, keep-in-touch with mutual yes only, share-my-plan, block/leave.
- **Drunk-proof + privacy:** night mode, big targets (tested), hold-to-confirm, undo toasts,
  ask-me-in-the-morning, EXIF stripping, signed media, hide-me, opt-in tags, mutual-invisibility
  blocks, reports with auto-hide, 21+ gate.
- **Engineering:** `make setup`, `make check` (green: 230 core/db/api tests + 37 mobile tests,
  lint, format, ledger, doctor), `make doctor`/`heal`, wait-for-quiet, sim.sh/demo.sh (our UDID,
  our PIDs only).

## How to run the demo

```
make setup            # once
scripts/demo.sh start # API :8788 + Metro :8091 + boots "NightCap iPhone" + opens Expo Go
# in the app: tap "Maya" → Night Owls → Start a night → snap → DEV tab (left edge) → friends snap
# → ☾ end (hold) → DEV: Skip to 7:05 → Look through my shots → I'm good → DEV: everyone's up
make maestro          # runs the whole loop by itself
scripts/demo.sh stop
```

## Next

- Milestone reviews and their fixes. Maestro flows for sharing + City Nights + old friends.
- Dev build (own icon, bundle id) when the machine is quiet.

## Needs from you

- **"Timeshare"**: which app did you mean? I couldn't find a photo/friends app by that name.
- For a real (non-mock) build: a Supabase project (URL, JWT secret, DB URL), Cloudflare R2 keys,
  an ID-verification provider (Persona/Stripe Identity/Yoti), the nightcap.app domain (links/QR
  currently point at a placeholder), an Apple developer team for a dev build on your phone.
