# MEET PEOPLE: safe ways to meet people in your city

> What works and what feels creepy, from the platforms that do this. Based on public
> descriptions of these products as I know them, not re-verified this session.

## The platforms
### Bumble BFF (2016–; relaunched as a standalone "BFF" app in 2025)
- Swipe-based friend matching with Bumble's photo verification and profile prompts. Groups and
  interest communities were added over time.
- **Works:** verified identities, an intent-clear context ("I'm here for friends"), and Bumble's
  safety brand.
- **Fails:** 1:1 friend "dates" are awkward. Chats die before anyone meets, and swiping on people
  feels like dating.

### Timeleft (Paris 2020–, expanded globally)
- Every week (traditionally Wednesday), **six strangers** matched by a personality quiz meet for
  dinner at a restaurant the app picks. You find out the restaurant shortly before and learn about
  your tablemates at the table. There's often an "after" bar for all the diners in the city that
  night. After dinner you can say who you'd like to see again, and contact only opens on a mutual
  match.
- **Works:**
  - **A container**: a fixed time, a public place, a group, a known structure.
  - The group dilutes awkwardness and risk. There's no profile browsing, so no judging photos.
  - **Mutual opt-in after the meeting**, so nobody can chase you.
  - Paid (subscription), which filters out low-intent users.
- **Lesson for NightCap:** the closest model to ours. A "table" of strangers at a public venue,
  matched lightly, with mutual opt-in afterwards.

### Meetup (2002–)
- Interest groups with recurring public events and organizer accountability.
- **Works:** shared interest as the icebreaker, recurrence (you see the same faces, which is how
  friendships form, per Hall), organizers as hosts.
- **Fails:** quality varies by city. Some groups are spammy or sales-y.

### Others
- **222** runs curated small-group outings (dinner and drinks) with a matching questionnaire.
- **Pie** organises small-group events for people new to a city.
- **Run clubs** are the 2023–25 "new bar" for meeting people: recurring, public, an activity first.
- **Eventbrite / Fever / Partiful public events:** discovery, but you go alone and leave alone.
- **Hinge / dating apps:** romantic intent pollutes "meet friends" contexts. We separate them.

## What makes it feel safe (the checklist)
1. **Groups, not 1:1.** Meet 4–8 people, or bring your own crew to meet another crew. Group-to-group
   is the safest and least awkward format: you arrive with friends.
2. **Public venues only.** Bars and restaurants that are partner or well-known public places.
   Never homes.
3. **A fixed time and a host or structure.** Not "hang out whenever".
4. **Verified adults.** 21+ verified (we stub ID verification and self-attest DOB in the
   prototype). A verified badge only, never shown with the DOB.
5. **No browsing strangers' photos beforehand.** First names plus one fun line, revealed only at
   the table. No location of members ever.
6. **No DMs before meeting.** No messages at all until both people opt in afterwards.
7. **Mutual opt-in afterwards** ("Keep in touch?" each way). Contact opens only on a match. A
   "no" is invisible.
8. **Safety tools that are always one tap away:** report, block (mutual invisibility), "share my
   plan with a friend" (sends the venue and time to someone you choose), leave anytime.
9. **The roll is the table's only.** Photos from a City Night go only to that table, still
   hold-until-morning, still hide-me for subjects. Strangers' photos never reach your crew's
   albums, and never vice versa.
10. **Clear norms up front:** a 4-line code of conduct you accept before your first City Night.
11. **Capacity and gender balance controls** so nobody ends up the only person of their gender at
    a table. Opt-in preference: "I'd prefer a table with women/non-binary people" (design only;
    the prototype implements a basic balance check).
12. **Repeat-meet friendly:** the same table can rebook together. Recurrence builds friendship.

## What makes it creepy (never)
- "People near you" maps, live locations, or "X is at this bar now".
- Seeing who viewed your profile.
- Strangers messaging you after seeing your photo.
- Photos of you at a City Night going anywhere except that table.
- Dating-app swipe mechanics for friendship.
- Location-based auto-grouping with strangers (Color's lesson).

## NightCap: City Nights (pillar 4)
- **Opt-in feature:** off by default. Turning it on needs 21+ verification (stubbed) and accepting
  the code of conduct.
- **City Nights:** a weekly list of curated nights per city ("Thursday Trivia Table at The Nook,
  6 seats"). Each event has a public venue, a time, a table size (4–8) and a theme (trivia,
  karaoke, dive-bar crawl, live music).
- **Sign up solo or as a crew** (a crew of 2–3 counts as one block, so group-to-group).
- **Tables are formed** by a pure function (`city.ts → formTables`): table sizes between min and
  max, crews kept together, a gender-balance soft constraint, people who've blocked each other
  never seated together, and people already matched spread out to meet new faces.
- **Reveal:** tablemates' first names and fun lines show 2 hours before.
- **During:** the table gets a shared roll (the same night engine, `kind = city`).
- **Morning after:** the album unlocks for the table *plus* the "Keep in touch?" opt-in for each
  tablemate. Mutual yes = a "connection", and they can then start a crew together.
- **Safety:** report or block anyone from the table screen, share-my-plan, leave the table, no DMs.

## Prototype scope
- City list (seeded: Minneapolis, Chicago, NYC), events seeded in mock mode, signup flow with the
  safety rules, the table reveal, the night roll, the morning "keep in touch" with a mutual match.
- Stubs: ID verification (self-attest + "verification pending" UI), venue partnerships, payments.
