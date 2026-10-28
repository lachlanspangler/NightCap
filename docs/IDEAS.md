# Ideas

> Generated from `docs/ideas_ledger.json` by `make ideas`. Edit the JSON (or use `node scripts/ideas.mjs`), not this file.
> Score = impact × confidence ÷ effort (each 1–5), +2 when it's on the demo's critical path (★).

**78 ideas**: backlog 18 · planned 47 · building 0 · built 0 · parked 2 · merged 0 · rejected 11

Pillars: `night` 20 · `sharing` 10 · `old_friends` 11 · `city` 10 · `drunk_ux` 7 · `privacy` 10 · `platform` 7 · `growth` 3

| id | status | pillar | name | pitch | closest | I/C/E | score | reason |
|---|---|---|---|---|---|---|---|---|
| I-007 | planned | night | Locked-roll teaser ★ | During the night show counts per friend ("Theo · 9 shots"), never the shots. | BeReal blurred feed | 4/5/1 | 22 | Anticipation without leaks. |
| I-009 | planned | night | Who took it ★ | Every photo credits its author; album sorts by time across everyone. | Google shared albums | 4/5/1 | 22 | Fixes "who has the photos". |
| I-022 | planned | sharing | Album-ready link for the group chat ★ | After the unlock, one tap posts "Last night's album is ready: 63 photos from 5 people". |  | 5/4/1 | 22 | Honest growth loop. |
| I-049 | planned | drunk_ux | Hold-to-confirm ★ | Destructive actions need a 1-second hold with a filling ring. | iOS hold to delete | 4/5/1 | 22 |  |
| I-021 | planned | sharing | Crew invite link | Long-lived (7 day), revocable crew invite links. | WhatsApp group links | 4/5/1 | 20 |  |
| I-005 | planned | night | 24-exposure roll ★ | Each person gets 24 shots per night; counter shows what's left. | Gudak, disposable cameras | 4/4/1 | 18 | Scarcity = better photos, no 400-burst rolls. |
| I-059 | planned | privacy | 21+ gate ★ | DOB at sign-up; ID verification stubbed. |  | 4/4/1 | 18 |  |
| I-008 | planned | night | Auto-end at 5am ★ | Live nights end at 05:00 local or after 12h; no capture after. |  | 3/5/1 | 17 | Clear boundary for unlock + review. |
| I-041 | planned | city | Share my plan | Send venue + time to a friend outside the app. | Uber share trip | 4/4/1 | 16 | Safety tool. |
| I-043 | planned | city | Table reveal 2h before | See tablemates' first names + one fun line 2 hours before. | Timeleft | 4/4/1 | 16 |  |
| I-051 | planned | drunk_ux | Big undo toasts | 8-second undo at night, 5 by day. | Gmail | 3/5/1 | 15 |  |
| I-054 | planned | drunk_ux | Haptic shutter | Heavy impact on capture, success haptic on save. |  | 3/5/1 | 15 |  |
| I-002 | planned | night | Morning-after unlock ★ | The roll develops at 10:00 local the morning after; nobody sees anything before. | Dispo 9am develop | 5/5/2 | 14.5 | Core loop; the wedge. |
| I-055 | planned | privacy | Hide-me ★ | Anyone in a photo hides it from everyone but the author, one tap. |  | 5/5/2 | 14.5 | Consent core (PRIVACY_SAFETY). |
| I-057 | planned | privacy | EXIF stripping ★ | Server strips GPS/EXIF/XMP from every JPEG before storage. |  | 5/5/2 | 14.5 | No location leaks. |
| I-003 | planned | night | Hold until morning review ★ | Before the unlock, each author swipes their own shots: keep or toss. | Lapse develop review | 5/4/2 | 12 | Consent + drunk regret (PRIVACY_SAFETY). |
| I-006 | planned | night | Develop animation ★ | Tiles develop from amber blur to photo one by one with haptics at the reveal. | Polaroid, Dispo | 5/4/2 | 12 | The emotional peak. |
| I-018 | planned | sharing | 4-digit night code ★ | Join a live night by a big 4-digit code said across the bar. | Kahoot PIN | 5/4/2 | 12 | Effortless join (THE_NIGHT +1 problem). |
| I-019 | planned | sharing | Night QR ★ | Show a QR; friends scan with the camera to join. | POV event QR | 5/4/2 | 12 |  |
| I-020 | planned | sharing | Invite link ★ | Share a link to the group chat; opens straight into the night or crew. | Partiful SMS link | 5/4/2 | 12 |  |
| I-023 | planned | sharing | Auto-group from crew ★ | Starting a night pings the crew; one tap to join the roll. | Apple Shared Library nearby suggestions | 5/4/2 | 12 | Album forms itself. |
| I-033 | planned | old_friends | Reunion countdown | Pin a trip date; countdown on the crew header. |  | 3/4/1 | 12 | Shared future anchor. |
| I-040 | planned | city | Keep in touch (mutual) ★ | After a City Night, opt in per tablemate; contact only on mutual yes. | Timeleft | 5/4/2 | 12 | No chasing. |
| I-042 | planned | city | Code of conduct gate | Accept 4 lines before the first City Night. | Airbnb community commitment | 3/4/1 | 12 |  |
| I-048 | planned | drunk_ux | Night mode ★ | 21:00–06:00 or in a live night: bigger targets, fewer choices, longer undo. |  | 5/4/2 | 12 | DRUNK_UX. |
| I-050 | planned | drunk_ux | Ask me in the morning ★ | Irreversible actions at night are deferred to a 10am confirmation. | Gmail undo send | 5/4/2 | 12 | Nothing permanent by accident. |
| I-058 | planned | privacy | Mutual-invisibility blocks ★ | Blocked pairs never see each other's shots or share a night/table. |  | 5/4/2 | 12 |  |
| I-061 | planned | privacy | Signed media URLs ★ | HMAC URLs bound to viewer + 10 min expiry. | S3 presign | 4/5/2 | 12 |  |
| I-068 | planned | platform | Doctor/heal checks ★ | Self-healing checks like GetOffTheCouch. |  | 4/5/2 | 12 |  |
| I-001 | planned | night | Night album ★ | Start a night from a crew; everyone who joins snaps into one shared roll. | Dispo rolls, POV | 5/5/3 | 10.3 | Core loop (THE_NIGHT). |
| I-065 | planned | platform | Dev mode + seeded demo ★ | Seeded crews, nights, photos, 3 friends, time travel. |  | 5/5/3 | 10.3 | Demo always looks alive. |
| I-004 | planned | night | Early reveal when everyone's up ★ | Unlock early once every participant taps "I'm good", counted only after 7am. | BeReal post-to-see | 4/4/2 | 10 | Sober check; makes the morning social. |
| I-010 | planned | night | Save all | One tap saves every visible photo from the night to the camera roll. | Google Photos download | 5/4/2 | 10 | Kills "send me those". |
| I-056 | planned | privacy | Opt-in tags ★ | Tags start pending, visible only to the tagged person. | Facebook tag review | 4/4/2 | 10 |  |
| I-067 | planned | platform | Procedural demo photos ★ | Generate bokeh/neon night photos deterministically. |  | 4/4/2 | 10 | No stock-photo licensing. |
| I-053 | backlog | drunk_ux | Ride home button | Big "get home" button opens Uber/Lyft at night end. |  | 3/3/1 | 9 | Nice safety touch. |
| I-028 | planned | old_friends | Long-distance crews ★ | Crew kind for old friends: weekly moment, recaps, nudges. | Retro, Locket | 5/4/3 | 8.7 | Pillar 3. |
| I-029 | planned | old_friends | Weekly Nightcap moment ★ | Fri 9–11pm local, one shot each, reveals when everyone's in or the window closes. | BeReal, Retro | 5/4/3 | 8.7 | Reciprocity at a gentle cadence. |
| I-066 | planned | platform | PGlite RLS harness ★ | Run real migrations + RLS in-process for tests and mock mode. |  | 5/4/3 | 8.7 | ADR 0002. |
| I-014 | planned | night | Night title + venue labels | Optional title and free-text venue ("The Nook"), never GPS. |  | 2/4/1 | 8 | Context without location leaks. |
| I-024 | planned | sharing | Guest join | Non-crew guests join a single night only; they never see crew history. |  | 4/4/2 | 8 | +1s happen every night. |
| I-030 | planned | old_friends | On this night | "1 year ago tonight" resurfacing from albums you were in. | Snapchat Memories | 4/4/2 | 8 | Nostalgia retention loop. |
| I-060 | planned | privacy | Report with auto-hide | Subject-category reports hide the shot pending review. |  | 4/4/2 | 8 |  |
| I-012 | planned | night | Reactions | Tap-and-hold a photo for 5 big reaction emojis. | RealMoji | 3/4/2 | 6 | Lightweight social glue after the reveal. |
| I-031 | planned | old_friends | Month in review | "October with Night Owls: 3 nights, 212 photos, 4 cities". | Spotify Wrapped | 4/3/2 | 6 |  |
| I-039 | planned | city | Crew-to-crew tables | Sign up as a crew of 2–3; seated together. |  | 4/3/2 | 6 | Safest + least awkward format. |
| I-072 | backlog | old_friends | Interview old-friend crews | 5 interviews with post-college groups. |  | 4/3/2 | 6 | Needs the user. |
| I-038 | planned | city | City Nights ★ | Opt-in curated nights at public venues; tables of 4–8. | Timeleft | 5/3/4 | 5.8 | Pillar 4. |
| I-069 | backlog | platform | Push notifications | Expo push for night started / album ready. |  | 4/4/3 | 5.3 | Needs EAS project + device; inbox in prototype. |
| I-071 | backlog | platform | Validate with 5 friend groups | Run the prototype with real groups for 2 weekends. |  | 5/3/3 | 5 | Needs the user. |
| I-013 | backlog | night | Highlights cover | Album cover auto-picks the most-reacted shot. | Google Memories | 3/3/2 | 4.5 |  |
| I-025 | backlog | sharing | Suggest crew from guests | After a night, "Add Sam to Night Owls?" for guests who came twice. |  | 3/3/2 | 4.5 |  |
| I-032 | planned | old_friends | Gentle nudges | Privately nudge others about the quietest member; ≤1/week; never shaming. |  | 3/3/2 | 4.5 | OLD_FRIENDS rules. |
| I-011 | backlog | night | Photo dump builder | Pick up to 10 from the album, reorder, share to Instagram. | IG photo dumps | 4/3/3 | 4 | Feeds IG instead of competing. |
| I-034 | backlog | old_friends | Parallel nights | Two members out in different cities on the same night → side-by-side recap. |  | 4/3/3 | 4 |  |
| I-015 | backlog | night | Video clips (5s) | Short clips in the roll, count as 2 exposures. | Snapchat | 4/3/4 | 3 | Video pipeline is heavy; after the slice. |
| I-016 | backlog | night | Dual-camera shot | Front + back together, BeReal-style. | BeReal | 3/3/3 | 3 | Fun, but slows capture in a dark bar. |
| I-017 | backlog | night | Get-one-of nudge | Prompt: "No shots of Jules yet. Get one?" |  | 3/2/2 | 3 | Could feel pushy; test later. |
| I-035 | backlog | old_friends | Home-screen widget | Latest album/moment on the home screen. | Locket | 4/3/4 | 3 | Needs a dev build (widgets not in Expo Go). |
| I-047 | backlog | city | Gender-balance preference | Opt-in preference for tables with women/non-binary people. |  | 3/3/3 | 3 | Basic balance check first. |
| I-070 | backlog | platform | Realtime shot counts | Supabase Realtime instead of 10s polling. |  | 2/4/3 | 2.7 |  |
| I-073 | backlog | growth | Partiful import | Paste a Partiful link to pre-make the night with guests. | Partiful | 3/2/3 | 2 |  |
| I-077 | backlog | night | AI best-of curation | Auto-pick the best 10 shots. | Google Photos | 3/2/4 | 1.5 | Needs ML; reactions do it socially first. |
| I-062 | backlog | privacy | Screenshot notice | Notify the author when someone screenshots. | Snapchat | 2/2/3 | 1.3 | Unreliable on iOS; honest copy instead for now. |
| I-063 | backlog | privacy | Face blur by default | Auto-blur faces of non-participants. |  | 3/2/5 | 1.2 | Needs on-device ML; later. |
| I-075 | parked | growth | Paid premium rolls | Pay for 36-exposure rolls / themes. | Dispo | 2/2/2 | 2 | Monetisation is out of scope. |
| I-074 | parked | growth | Venue partner nights | Bars host City Nights; drink specials. | Timeleft | 3/2/4 | 1.5 | Business dev; post-prototype. |
| I-027 | rejected | sharing | Contact book invites | Upload contacts to find friends. | Lapse | 3/3/2 | 4.5 | Privacy cost + Lapse's spam lesson; links instead. |
| I-036 | rejected | old_friends | Streaks | Daily/weekly posting streaks. | Snapchat | 2/2/1 | 4 | Guilt + chore (OLD_FRIENDS). |
| I-037 | rejected | old_friends | Read receipts | Show who viewed your photo. |  | 1/3/1 | 3 | Pressure to reply; creepy. |
| I-064 | rejected | privacy | Public albums | Share an album publicly via link. | Google Photos | 2/3/2 | 3 | Breaks friends-only (rule 2). |
| I-076 | rejected | night | Live feed during the night | See friends' shots as they're taken. | Snapchat stories | 2/3/2 | 3 | Breaks the reveal + the drunk safety net; that's NightOut's job. |
| I-052 | rejected | drunk_ux | Breathalyzer gate | Prove sobriety with a reaction-time test before posting. | Drunk Mode apps | 2/2/2 | 2 | Gimmicky and patronising; morning unlock solves it. |
| I-078 | rejected | night | Filters at capture | Choose filters before shooting. | Instagram | 1/4/2 | 2 | Slows capture; one consistent develop look instead. |
| I-026 | rejected | sharing | Bluetooth proximity auto-join | Phones nearby auto-join the same night. | Color, Flock | 4/2/5 | 1.6 | Native BLE work + Color's creepiness lesson; code/QR covers it. |
| I-045 | rejected | city | DMs with strangers | Message tablemates before meeting. | Bumble BFF | 2/2/3 | 1.3 | Harassment vector; mutual opt-in after instead. |
| I-046 | rejected | city | Swipe on people | Swipe-match friend candidates. | Bumble BFF | 2/2/3 | 1.3 | Feels like dating; group containers instead. |
| I-044 | rejected | city | People near you map | See who's out nearby. | Snap Map, Color | 2/1/3 | 0.7 | Creepy + stalking risk (MEET_PEOPLE). |
