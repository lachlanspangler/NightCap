# DRUNK UX: designing for someone who's had a few

> Grounded in what alcohol does to perception and motor control, plus mobile-accessibility norms
> (Apple HIG's 44pt minimum, WCAG 2.2 target size, Fitts's law). The night-mode rules here are
> enforced in `packages/core/src/drunk.ts` and the design tokens.

## What changes after a few drinks (and in a dark, loud bar)
| effect | consequence for UI | rule |
|---|---|---|
| **Fine motor control drops**; tremor; slower corrections | Missed small targets, accidental taps on neighbours | **Primary target ≥ 88pt in night mode**, every target ≥ 56pt, ≥ 16pt spacing between tappables |
| **Visual acuity and contrast sensitivity drop**; dark adaptation; double vision | Small or low-contrast text unreadable | Body ≥ 18pt in night mode, key numbers ≥ 48pt, contrast ≥ 7:1 (AAA) for text on night bg |
| **Working memory and attention narrow** | Multi-step flows abandoned midway; choices overwhelm | **One primary action per screen.** No forms at night. No more than 3 choices visible. |
| **Disinhibition**, worse judgment | Regrettable posts, messages, deletions | **Nothing is visible to others until morning.** Irreversible actions are deferred to the morning |
| **Reaction time slows** | Short undo toasts disappear before you read them | Undo windows **≥ 8 s** at night (5 s by day) |
| **Hearing masked** (loud music) | Sound cues useless | Haptics, not sound. No audio cues. |
| **Bright light hurts in dark rooms** | White screens blind you and everyone around | A dark, warm night palette. No pure white backgrounds at night. Dimmed shutter flash UI |
| **One hand** (drink in the other) | Top-of-screen controls unreachable | Primary actions in the **bottom third**. Shutter bottom-centre. |
| **Low battery** (15% at midnight) | App must be light | No live video previews beyond the camera. Lazy-loaded images. No background location. |

## Principles
1. **Big and few.** In night mode, the camera screen has one huge shutter, a big shot counter, and
   *at most* two secondary actions (invite, end night), both ≥ 56pt.
2. **Nothing permanent by accident.**
   - Every destructive action is **hold-to-confirm** (press and hold 1 second, with a filling
     ring), never a tap or a small "OK" in a dialog. A hold is hard to do by accident and easy to
     do on purpose.
   - Every destructive action has an **undo window** (8 s at night) before it runs.
   - **Deferred to the morning:** leaving a crew, deleting your account, removing a member,
     blocking someone (block is the exception when there's a safety reason: "block now" stays
     available. Safety beats regret).
     The UI says "We'll ask you again at 10am. If you still want to, it's one tap."
3. **The morning review is the safety net.** Shots aren't visible until the unlock. Authors can
   discard their own before then. Subjects can hide after.
4. **Forgiving input.** No text fields at night except join name and code. The code is 4 big
   digits in a big keypad. Typos aren't fatal: codes are case-insensitive and auto-trimmed.
5. **State you can read at a glance.** "Night with Night Owls · 17 left · develops 10:00 AM".
6. **No surprise navigation.** No swipe-to-dismiss on critical screens at night (accidental
   swipes). Back is a big labelled button.
7. **Haptics confirm everything.** Shutter = heavy impact, saved = success notification,
   undo = light.
8. **Sober check:** early unlock and approve-all actions only count after 07:00 local. Copy:
   "Tap this when you're up for real."

## Night mode: when is it on?
`isNightMode(now, tz, liveNight)` in core:
- ON if you're in a live night, **or** local time is 21:00–05:59.
- User override: Always / Auto / Never (settings). Auto is the default.
- Night mode switches tokens: bigger type ramp, bigger targets, longer undo, the deferral rules.

## Copy voice
Warm, short, a little cheeky, never judgmental about drinking. Never "you're drunk". Say "it's
late", "future you", "morning you".
- "Future you will thank you."
- "Developing… see it at 10:00 AM."
- "Roll's full. You're in the moment now."
- "It's late. We'll ask you again in the morning."
- "Everyone's up? Reveal early."

## Testable rules (enforced)
- `nightTargetMin = 56`, `nightPrimaryMin = 88`, `dayTargetMin = 48`. A screen test asserts the
  shutter's style ≥ 88 and every `Pressable` on the live-night screen ≥ 56.
- `undoWindowMs(nightMode) = nightMode ? 8000 : 5000`.
- `shouldDefer(action, nightMode)` → true for `leave_crew`, `delete_account`, `remove_member`,
  `delete_crew` in night mode. `block_user` and `report` are never deferred.
- `canCountReview(now, tz)` → local hour ≥ 7.
- The contrast test fails if any night-palette text pair is below 7:1.
