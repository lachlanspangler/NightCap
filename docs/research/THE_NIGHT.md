# THE NIGHT: how a night out actually goes, and where the photos get lost

> This is a model built from common patterns (group-chat behaviour, how the event-camera
> products work, how people talk about "send me those"). It is not from interviews. Validating it
> with 5 real friend groups is idea I-047. Every claim below turns into a product decision,
> marked **→**.

## The timeline of a typical night (group of 4–8, ages 21–30)

| time | what happens | photos | where they go | failure |
|---|---|---|---|---|
| **Afternoon** | "Out tonight?" in the group chat. Plans form loosely, people drop in and out. | 0 | — | Who's coming is fuzzy until 9pm. |
| **7–9pm pregame** | Someone's apartment. Getting ready, outfit checks, the "before" group photo. | Many, good quality (sober, good light) | Each person's camera roll; some to IG stories | The best group photo is on one phone. |
| **9–11pm first spot** | Bar or restaurant. The group grows (+1s, a coworker, a friend-of-friend). | Steady, decent | Camera rolls; story | New people aren't in the group chat. |
| **11pm–1am peak** | Second spot, dancing, the loud bar. The group splits and merges. | Burst: blurry, flash, video clips, the "moment" | Camera rolls; snaps to people *not* there | Nobody's thinking about sharing. Hands are full, phones at 15%. |
| **1–2:30am late** | Late-night food, the walk home, the Uber. Some people already left. | Few, often the funniest | Camera rolls | The drunk-post risk: sending/posting something regrettable. |
| **2–4am** | Home. Maybe a regrettable story post or text. | — | Social media | Posting drunk with no review step. |
| **10am–1pm morning after** | Hangover, debrief in the group chat, "who has the photos??", "send me those" | — | Group chat dump, compressed, partial | Half the photos never get sent. Live Photos and video get lost. Unflattering photos get sent without asking. |
| **That week** | Someone makes a photo dump on IG from collected photos. | — | Instagram | Credit and consent are an afterthought. |
| **Months later** | "Remember that night?" Nobody can find the photos. | — | Lost in camera rolls | No shared archive. |

## Who takes the photos
- **One or two "documenters"** take most of them. In most groups 20% of people take 80% of the
  photos, and they're usually the most sober or the most social.
  **→** The documenter must not be stuck as the album admin. Their shots should flow to everyone
  automatically.
- **Everyone else** takes a handful of bursts at peak moments.
  **→** Capture must be one tap from the lock screen or app open. No choosing an album.
- **The documenter is rarely in the photos.**
  **→** Shots from everyone fill the gaps. A "get one of [name]" nudge is a later idea.
- **Photos of other people are most of the roll.**
  **→** Consent for subjects is the core problem, not an edge case (PRIVACY_SAFETY.md).

## The "send me those" problem, broken down
1. **Discovery:** you don't know what photos exist. "Did anyone get one of us at the second bar?"
   **→** The album shows *how many* shots exist (and by whom) before the unlock, so you know
   something is coming. A countdown to the morning builds anticipation.
2. **Request friction:** you have to ask, and it's awkward to keep asking.
   **→** Nobody asks anybody. Shots go into the shared roll at capture.
3. **Sender friction:** sending means selecting 40 photos, picking a chat, waiting on upload. The
   sender gets nothing for it.
   **→** No sending step. The album *is* the send.
4. **Quality loss:** chat apps compress, drop Live Photos and lose order.
   **→** Originals (EXIF-stripped) in time order, saved to the camera roll in one tap ("Save all").
5. **Consent:** the sender decides alone which unflattering photos go out.
   **→** The morning review: each author can discard before the unlock, and each subject can hide
   after.
6. **Fragmentation:** some photos land in the chat, some on IG, some never anywhere.
   **→** One album per night, one link into the group chat.

## Joining mid-night (the "+1" problem)
- Groups change all night. Friends of friends join at the second bar, and the crew isn't the
  whole night.
  **→** A night is joinable by **4-digit code** (big, readable, say it out loud across a loud
  bar) or **QR** (hold your phone up) or a **link** in the chat. Joining asks for a first name and
  your 21+ date of birth, nothing else.
  **→** Crew vs night: a night belongs to a crew, but participants can include guests. Guests see
  only that night, never the crew's history.
- People leave early. **→** Leaving keeps your shots in the album (you were there), and you still
  get the unlock. "Leave night" never deletes anything.

## The drunk-post window (1am–4am)
- The most regretted posts happen here. Every major platform has stories of drunk posts and texts.
  **→** Nothing NightCap captures is visible to anyone (not even the crew) until the morning. The
  roll is "developing". Drunk you can't overshare because there's nothing to overshare *to*.
  **→** Irreversible actions during night mode (leave crew, delete account, block) are deferred
  to the morning with a single "Ask me in the morning" sheet (DRUNK_UX.md).

## The morning after (the reveal)
- People wake up between 9am and 1pm. The group chat comes alive around 10–11am.
  **→** Default unlock is **10:00 local time** the morning after (computed for the night's
  timezone, DST-safe), and at least 6 hours after the night started.
  **→** **Early unlock:** if everyone who was there has done their morning review ("I'm good"),
  it unlocks right away, but **reviews only count after 7:00am**. A "yes, reveal it" at 3am
  doesn't count. That's the sober check.
- The reveal is the emotional peak. It should feel like opening a pack.
  **→** The unlock animation: tiles "develop" from amber blur to photo, one by one, with haptics.
  The night palette fades into dawn.
- **The morning review before the unlock** ("hold until morning"): each author swipes through only
  their own shots, keep or toss, in big buttons. Untouched shots are kept by default, so a
  forgotten review never loses photos. You can still delete after.
  **→** Default keep (not default discard). Losing a great photo because someone slept until 2pm
  is worse, and subjects can still hide anything after the unlock.

## Night boundaries
- **Start:** someone taps "Start a night" in the crew (one big button). It notifies the crew
  ("Maya started a night: join the roll"). Joining is one tap.
- **End:** auto-ends at **5:00am local** (or 12h after start, whichever is first). The host can
  end it early. After the end there's no new capture, only review.
  **→** Shots taken after the end are rejected server-side with a friendly message.
- **Multiple nights:** one live night per crew at a time. A person can be in only one live night
  at a time (simpler capture, fewer mistakes).

## The roll
- 24 exposures per person per night (disposable-camera nostalgia, Gudak's lesson). It prevents
  400-burst rolls, makes each shot feel special, and keeps storage sane.
  **→** The counter is visible and big ("17 left"). At 0 the shutter turns into "Roll's full —
  you're in the moment now".
  **→** Configurable per night later (12 / 24 / 36). 24 is the default.

## What we deliberately don't do
- No live feed during the night (that's NightOut's job: venue feeds; NightCap is friends-only).
- No GPS check-ins and no "where is everyone" map.
- No public posting, no likes count, no follower graph.
- No filters at capture (speed matters). A develop look is applied consistently at the reveal.

## Success metrics for the prototype demo
- Crew → live night in **≤ 2 taps** from app open.
- Join a friend's night from a code in **≤ 10 seconds**.
- Shutter reachable in **1 tap** from app open during a live night.
- Morning reveal shows **everyone's** shots, in time order, with who took each.
- "Save all" and "share to group chat" are each **1 tap** after the unlock.
