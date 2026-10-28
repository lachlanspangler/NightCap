# OLD FRIENDS: how friend groups stay close after college, and what keeps them sharing

> Synthesis of widely cited friendship research (Dunbar's layers, Hall's hours-to-friendship work,
> Fehr's friendship processes) and how long-distance groups use group chats, Locket, BeReal and
> Retro. Not interviews. Validation is I-048.

## What the research says (as commonly reported)
- **Friendship takes time and decays without contact.** Jeffrey Hall's widely cited work (2018)
  estimated roughly **50 hours** together to go from acquaintance to casual friend, ~90 to friend,
  and **200+ hours** to close friend. Closeness decays without interaction, and moving away is the
  classic trigger.
- **Dunbar's layers** (~5 intimate, ~15 close, ~50 good friends, ~150 meaningful contacts):
  friendships slide outward layer by layer when contact drops. Robin Dunbar's work suggests close
  friends need contact roughly weekly to monthly to hold their layer.
- **Shared activity beats talk for many groups.** Doing things together (or *seeing* each other do
  things) maintains bonds better than "how are you" check-ins, which feel like obligations.
- **Ritual and rhythm** (the annual trip, the weekly call, the fantasy league) are how groups
  survive distance. Regularity matters more than intensity.
- **Low-effort signals count.** Small "thinking of you" signals (a reaction, a photo, a meme)
  maintain ties surprisingly well. That's Locket's insight.

## The post-college arc
| years out | what happens | sharing behaviour |
|---|---|---|
| 0–1 | Everyone scatters to cities and jobs. The group chat is very active. | Lots of photos, "miss you guys" |
| 1–3 | The chat quiets. A few people carry it. Visits to each other's cities. | Bursts around visits and weddings |
| 3–6 | Weddings, a reunion trip. A core of 4–6 stays close and the rest drift. | Mostly event-driven |
| 6+ | Kids, moves. "We should really get everyone together." | Nostalgia ("10 years ago today") |

## Why old-friend groups stop sharing
1. **Nothing feels share-worthy.** A normal Tuesday isn't post-worthy, and BeReal's lesson is that
   boring content kills it.
2. **Asymmetry:** one person posts and nobody reacts, so they stop. The carrier burns out.
3. **The group chat gets drowned** by logistics, memes and one loud person, so photos get lost.
4. **Platform drift:** the IG group dies, the WhatsApp group is muted.
5. **Life-stage gaps:** someone's going out every weekend, someone else has a newborn, and sharing
   nights out can feel like rubbing it in.

## What gets them sharing again
- **A shared prompt everyone answers at the same time** (BeReal's reciprocity, at a gentler
  cadence). Posting is less awkward when everyone is posting.
- **A reveal that needs everyone** ("unlocks when everyone's in"), so you feel needed, not ignored.
- **Nostalgia resurfacing** ("3 years ago tonight: Senior Formal") works hard for groups with
  history. Snapchat and Facebook memories prove the pull.
- **Parallel nights:** "the crew's out in three cities tonight". Each person's night out becomes
  part of a shared night, which bridges distance.
- **Reunion anchors:** a countdown to the next trip or wedding gives the group a shared future.
- **No pressure, no streak shaming.** Life-stage gaps mean the newborn parent must never feel
  guilted. Nudges are gentle, rare and easy to snooze.

## NightCap design for long-distance crews (pillar 3)
- **Crew kind: "long-distance".** Same album engine, different rhythm.
- **The weekly Nightcap (moment):** once a week, at a crew-chosen evening (default Friday
  21:00–23:00, each person's *local* time), everyone gets "Nightcap: show us your night". One
  shot each, whatever your night is (bar, couch, baby, work). It reveals when everyone's posted
  or when the window closes, as a grid of everyone's nights side by side. **→** reuses the night
  engine with `kind = moment`, roll = 1.
  - Couch nights are first-class. Copy: "Big night or a quiet one: we want to see it."
- **Parallel nights:** when two or more members start nights in different cities on the same
  evening, the morning recap shows them side by side ("Saturday: Theo in Chicago, Jules in
  Denver").
- **Recaps:**
  - *On this night*: "1 year ago tonight" from the crew's albums. Only from albums you were in,
    only shots not hidden.
  - *Month in review*: "October with the Night Owls: 3 nights, 212 photos, 4 cities".
- **Nudges** (pure logic, rate-limited, never shaming):
  - The quietest-member nudge goes to *others*, privately: "Jules hasn't been in a moment for a
    month. Send a ping?" Not to Jules ("you haven't posted").
  - At most 1 nudge per person per week. Muting a crew silences nudges. No streaks.
  - Moment reminder 30 minutes before the window closes, only if you haven't posted.
- **Reunion countdown:** pin a date ("Lake house 🏡 in 23 days"). Shows on the crew header.
- **Crew size:** 2–20. Most long-distance cores are 4–8. Above 20 it's a community, not a crew.

## What we won't do
- **Streaks.** They become chores and guilt. (Snapchat streaks are famously stressful for teens.)
- **"X viewed your photo" read receipts.** They pressure replies.
- **Ranking friends** (Best Friends lists). It's toxic for groups.
- **A public profile.**
