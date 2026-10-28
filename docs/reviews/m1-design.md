# M1 design review: core loop

Reviewer: senior mobile product design (outside eyes). Inputs: DRUNK_UX.md, ADR 0008, core-00…11, core-loop.mp4. DEV tab ignored.

The night half is real. The type, the amber, the code and the shutter already feel like a product. The morning half, which is the whole reason the app exists, is a fade and a grid. Right now NightCap is a good disposable camera with an ordinary photo album bolted on.

## Grades

| Screen | Grade | Why |
| --- | --- | --- |
| 00 Welcome | B+ | Strong wordmark and tagline. The film-tile fan sits off-centre (big gap on the right), and the tiles look like caramel cards, not film. |
| 01 Home | C+ | Nice voice, but no primary action, no live/developing state, 14pt meta text, and emoji tab icons that look like a template. |
| 02 Crew | B- | "Start a night" is a perfect 88pt primary. "Recaps · on this night" is unclear, and every album cover is the same bokeh-silhouette art. |
| 03 Camera (empty) | B | Huge counter and shutter. The moon button is a mystery and the hint is tiny. |
| 04 Camera (friends) | B | Avatar stack and "12 in the roll" work. The hint says "Not even you", which the product contradicts two screens later. |
| 05 Invite | A- | Best screen in the app. Giant Fraunces code, cream QR that holds up in a dark bar. "Done" is a bare text target. |
| 06 Developing 3am | C | No primary action. The key card ("Get some sleep.") is below the fold. Everyone shows as "asleep" when they're still out. |
| 07 Developing 7am | B- | "I'm up. I'm good." is great copy, but the button is clipped by the home indicator. Still full night palette at sunrise. |
| 08 Review | B | Big photo, clear choice. Toss is a single tap right next to Keep, and undo is a small glyph in the top corner. |
| 09 Reveal | C+ | The "reveal-start" capture looks identical to the finished album. The emotional peak is a 1.6s crossfade. |
| 10 Album | B- | "It developed." lands. The grid is ordered by author (M,M,M,T,T,T…), and the red "Save all" is off-palette. |
| 11 Photo | C+ | Pure black breaks the dawn palette, consent is hidden behind "⋯", and 🥴 is a drinking joke in the reaction bar. |

## Top 10 issues (by impact)

1. **The reveal has no ceremony.** BeReal has the 2-minute alarm and Dispo has the 9am drop; ours is an opacity tween (`Unlocked` in `app/album/[id].tsx`: 1.6s sky fade, 140ms tile stagger). The "first open" flag also lives in a module-level `Set`, so it replays on cold start. **Fix:** make the first open of an unlocked album its own full-screen moment. Start on the night ink with the contact sheet of film tiles and one 88pt "Hold to develop". On hold, the sky goes ink → dawn over about 3s and frames develop one at a time in time order, with a haptic tick each. End on "It developed. 12 photos from 4 of you." Store "revealed" per user in AsyncStorage or the server. Push copy: "Last night developed."
2. **The album tells the night by author, not by time.** The story is the arc of the evening. **Fix:** sort shots chronologically, add quiet time dividers ("11 PM", "1 AM", "after 2"), and keep the author as the small corner badge.
3. **Copy contradicts the product.** The camera says "Nobody sees anything until the morning. Not even you." Review then says "only you can see these" and lets you toss your own shots. **Fix:** change the camera hint (`app/night/[id].tsx`) to "Nobody else sees a thing until morning." One promise, kept everywhere.
4. **The 3am Developing screen has no hierarchy.** **Fix:** in night mode, make the countdown the hero in 56pt Fraunces ("6h 42m"), with "Ready at 10:00 AM" under it. Move "Get some sleep." above the fold and shrink the roll card to one line of film strips. Rename "asleep" to "not up yet". At 7am, pin "I'm up. I'm good." to a sticky bottom bar inside the safe area so it's never clipped.
5. **Toss is one tap from Keep.** That breaks "nothing permanent by accident". **Fix:** in night mode, Toss either needs a hold, or fires a bottom 8s undo toast ("Tossed. Undo"). Put at least 24pt between the two buttons and make Keep visibly primary (wider). Move undo out of the top-right corner into the bottom bar.
6. **The photo viewer abandons the brand and buries consent.** **Fix:** use a deep ink background (`#0C0A14`) with a faint peach glow at the top instead of `#000`. For tagged users, add a labelled 56pt "That's me, hide it" button, because consent is a pillar and it shouldn't sit behind "⋯". Drop 🥴 ("never judgmental about drinking"). Add a swipe hint or page dots.
7. **The dawn palette has no accent, so a random red got used.** The red "Save all" reads as destructive, the same family as Toss. **Fix:** add a `dawn.accent` token to `theme.ts`. The primary is an ink pill with cream text; "Tell the group" stays the light secondary. Contrast test both.
8. **Night type breaks its own 18pt rule.** Crew meta, the "Start a night" helper, the camera hint and the Developing subtext are all about 13–15pt. **Fix:** set an 18pt floor on the night body token and cut copy to fit rather than shrink it. Add a size assertion next to the contrast test.
9. **Home doesn't know what time it is.** At 3:17am there's no live or developing night card and no primary action, and "You're in 2 photos" (a morning task) is the hero. **Fix:** when a night is live or developing, the top card is that night ("Night Owls · 21 left · develops 10 AM") with an 88pt "Back to the camera". Show the tag card only after unlock, with a chevron. Replace the emoji tab icons and emoji crew avatars with drawn glyphs.
10. **Camera chrome is ambiguous.** It's unclear what the X does versus the moon button (the moon opens "Wrap up the night?"). The header is 14pt and sits in the top-corner dead zone for one-handed use. **Fix:** relabel the moon as a 56pt "Wrap up" pill, make X a labelled "Back", and raise the hint to 16pt+ right above the shutter. While you're there, centre the welcome tile fan.

## Keep these, no matter what

1. **The invite sheet.** You can shout "5912" across a bar, and the cream QR scans in the dark. It beats BeReal and Locket's friend-adding flows.
2. **Night → dawn as the product's metaphor.** Ink/amber to peach/lilac, Fraunces headlines ("Developing…", "It developed."), and copy like "I'm up. I'm good." and "Nothing you approve at 3am counts." This is the brand. Push it further, don't dilute it.
3. **The camera's "big and few" core.** Fraunces "21 left", a 96pt amber shutter, and a hold-to-end with "Keep holding…" feedback. It feels like a disposable camera without Dispo's clutter.

Sign-off: no — needs fixes 1..6

## Round 2

Inputs: new core-01…12 and core-loop.mp4 (I stepped through the reveal frame by frame at 2fps). Fixes 1–7 and 10 have landed. The morning is now the best part of the app, which is how it should be.

### Updated grades

| Screen | R1 | R2 | Why |
| --- | --- | --- | --- |
| 03/04 Camera | B | B+ | The hint is honest now and "‹ Home" is clear. "Wrap up" breaks onto two lines and has no visible pill, so it reads as a caption, not a 56pt target. |
| 06 Developing 3am | C | A- | The 64pt "6h 12m" hero, then "Get some sleep." above the fold. Right hierarchy, right voice. "not up yet" fixes the tone. |
| 07 Developing 7am | B- | A- | The sticky "I'm up. I'm good." bar sits in the thumb zone and nothing gets clipped. |
| 08 Review | B | B+ | Keep is clearly the primary, there's a real gap, and Toss can be undone. The top toast is the right call given what Maestro caught, but undo is now out of thumb reach. |
| 09 Reveal gate | — | A | "Good morning. Last night is ready." and "Nobody's seen them yet" are exactly right. The hold fills amber, the sky goes ink → dawn, and the frames develop in order. This is the peak we wanted. |
| 10/11 Album | B- | B+ | The ink "Save all" fits the dawn palette. The date shows twice (header and meta line). The demo has only one divider ("AFTER 2 AM"), so the grid still looks grouped by author. |
| 12 Photo | C+ | B | The ink background with a peach glow fixes the palette. 🌅 renders as a framed picture and reads as an image, not a reaction. I couldn't check "That's me, hide it" because this screenshot is your own photo; please capture it on a friend's photo. |

### Still open (none block sign-off)

1. **The reveal hard-cuts from layout to layout.** On release, the tilted 4-column contact sheet snaps to the straight 3-column grid, and then the frames develop. Animate the frames from their contact-sheet positions into the grid (shared layout, about 400ms), or use the 3-column grid on the gate too, so each frame develops in place. Also hide "Keep holding. It's worth it." until the press starts.
2. **The demo seed undercuts fix 2.** Spread the demo `taken_at` values from about 10 PM to 3 AM so the dividers ("10 PM", "11 PM", "AFTER 2 AM") show up and the grid interleaves authors. The demo is the pitch.
3. **Album header:** drop the date from the meta line, so it reads "12 photos from 4 of you · Everyone was up early" and the chip goes.
4. **Camera "Wrap up":** one line, filled ink pill, at least 56pt, same style as "‹ Home".
5. **Reactions:** swap 🌅 for an emoji that renders as a glyph (☀️ or 🫶), or draw custom reaction glyphs.
6. **Carried over from round 1:** #8 (18pt night body floor beyond the camera hint) and #9 (home has no live/developing night card or primary action, plus emoji tab icons). Both are polish for M2, not loop blockers.

Sign-off: yes — the core loop, from shutter to reveal, now meets the bar. Fix open items 1–4 before any external demo.
