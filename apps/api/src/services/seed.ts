// Demo world for mock mode (CLAUDE.md rule 8: demo data is flagged is_demo and only loads in mock).
// Everything is relative to the clock so the demo always looks alive: a birthday last Saturday, a
// night one year ago tonight (for "On this night"), weekly Nightcap moments, upcoming City Nights.
import {
  DAY,
  HOUR,
  MINUTE,
  computeNightSchedule,
  localParts,
  pastMoments,
  zonedToInstant,
  addLocalDays,
  DEFAULT_MOMENT,
} from "@nightcap/core";
import { asService, makeUser, type Queryable } from "@nightcap/db";
import type { Deps } from "../deps";

export const DEMO_TZ = "America/Chicago";

export const DEMO_USERS = [
  {
    key: "maya",
    id: "11111111-1111-4111-8111-111111111111",
    name: "Maya",
    hue: 330,
    city: "Minneapolis",
    gender: "woman",
    fun: "Will request ABBA. Will dance to ABBA.",
  },
  {
    key: "theo",
    id: "22222222-2222-4222-8222-222222222222",
    name: "Theo",
    hue: 200,
    city: "Minneapolis",
    gender: "man",
    fun: "Designated photographer (self-appointed).",
  },
  {
    key: "jules",
    id: "33333333-3333-4333-8333-333333333333",
    name: "Jules",
    hue: 40,
    city: "Minneapolis",
    gender: "nonbinary",
    fun: "Knows every bouncer by name.",
  },
  {
    key: "sam",
    id: "44444444-4444-4444-8444-444444444444",
    name: "Sam",
    hue: 260,
    city: "Minneapolis",
    gender: "man",
    fun: "Leaves early, somehow in every photo.",
  },
  {
    key: "priya",
    id: "55555555-5555-4555-8555-555555555555",
    name: "Priya",
    hue: 150,
    city: "Chicago",
    gender: "woman",
    fun: "Chicago correspondent.",
  },
  {
    key: "devin",
    id: "66666666-6666-4666-8666-666666666666",
    name: "Devin",
    hue: 20,
    city: "New York",
    gender: "man",
    fun: "New dad, honorary night owl.",
  },
  // City Nights strangers (Minneapolis).
  {
    key: "ava",
    id: "77777777-7777-4777-8777-777777777777",
    name: "Ava",
    hue: 300,
    city: "Minneapolis",
    gender: "woman",
    fun: "New in town from Denver. Trivia shark.",
  },
  {
    key: "noah",
    id: "88888888-8888-4888-8888-888888888888",
    name: "Noah",
    hue: 100,
    city: "Minneapolis",
    gender: "man",
    fun: "Will talk about bikes if you let him.",
  },
  {
    key: "lena",
    id: "99999999-9999-4999-8999-999999999999",
    name: "Lena",
    hue: 180,
    city: "Minneapolis",
    gender: "woman",
    fun: "Karaoke: power ballads only.",
  },
  {
    key: "marcus",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Marcus",
    hue: 220,
    city: "Minneapolis",
    gender: "man",
    fun: "Moved for grad school. Seeking a run club.",
  },
  {
    key: "zoe",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Zoe",
    hue: 350,
    city: "Minneapolis",
    gender: "woman",
    fun: "Dive bars > cocktail bars. Fight me.",
  },
] as const;

export type DemoKey = (typeof DEMO_USERS)[number]["key"];
export const demoId = (k: DemoKey) => DEMO_USERS.find((u) => u.key === k)!.id;

export const DEMO_CREWS = {
  owls: "c0000000-0000-4000-8000-000000000001",
  college: "c0000000-0000-4000-8000-000000000002",
};

/** Local wall time `daysAgo` days back at hour:minute in DEMO_TZ. */
function localAt(now: Date, daysAgo: number, hour: number, minute = 0) {
  const d = addLocalDays(localParts(now, DEMO_TZ), -daysAgo);
  return zonedToInstant({ ...d, hour, minute }, DEMO_TZ);
}

/** The most recent Saturday 21:00 at least 2 days ago (so it's unlocked). */
function lastSaturdayNight(now: Date) {
  for (let k = 2; k < 10; k++) {
    const t = localAt(now, k, 21);
    if (localParts(t, DEMO_TZ).weekday === 6) return t;
  }
  return localAt(now, 7, 21);
}

export async function isSeeded(deps: Deps) {
  return asService(
    deps.db,
    async (tx) =>
      (await tx.query<{ n: number }>(`select count(*)::int as n from profiles where is_demo`)).rows[0]!.n > 0,
  );
}

export async function wipeDemo(deps: Deps) {
  const keys = await asService(
    deps.db,
    async (tx) =>
      (
        await tx.query<{ media_key: string }>(
          `select media_key from shots where is_demo or author_id in (select id from profiles where is_demo)`,
        )
      ).rows,
  );
  for (const k of keys) await deps.media.delete(k.media_key).catch(() => undefined);
  await asService(deps.db, async (tx) => {
    await tx.query(`delete from city_events where is_demo`).catch(() => undefined);
    await tx.query(`delete from auth.users where id in (select id from profiles where is_demo)`);
  });
}

export async function seedDemo(deps: Deps): Promise<{ shots: number }> {
  const photos = (await deps.demoPhotos?.()) ?? [];
  const now = deps.clock.now();
  let photoIdx = 0;
  let shotCount = 0;
  const nextPhoto = () => photos[photoIdx++ % Math.max(1, photos.length)];

  await asService(deps.db, async (tx) => {
    for (const u of DEMO_USERS) {
      await makeUser(tx, u.name, {
        id: u.id,
        isDemo: true,
        hue: u.hue,
        city: u.city,
        tz: u.city === "Chicago" ? "America/Chicago" : u.city === "New York" ? "America/New_York" : DEMO_TZ,
      });
      await tx.query(`update profiles set gender = $2, fun_line = $3 where id = $1`, [u.id, u.gender, u.fun]);
    }
    // Maya is the demo's main character: opted in to City Nights (verified via the stub).
    await tx.query(
      `update profiles set city_opt_in = true, coc_accepted_at = $2, age_verified_at = $2 where id = $1`,
      [demoId("maya"), now],
    );
    for (const k of ["ava", "noah", "lena", "marcus", "zoe"] as const) {
      await tx.query(
        `update profiles set city_opt_in = true, coc_accepted_at = $2, age_verified_at = $2 where id = $1`,
        [demoId(k), now],
      );
    }

    await tx.query(
      `insert into crews (id, name, emoji, kind, tz, created_by, is_demo, created_at) values ($1, 'Night Owls', '🦉', 'local', $2, $3, true, $4)`,
      [DEMO_CREWS.owls, DEMO_TZ, demoId("maya"), new Date(now.getTime() - 400 * DAY)],
    );
    for (const [k, role] of [
      ["maya", "owner"],
      ["theo", "member"],
      ["jules", "member"],
      ["sam", "member"],
    ] as const) {
      await tx.query(`insert into crew_members (crew_id, user_id, role, joined_at) values ($1, $2, $3, $4)`, [
        DEMO_CREWS.owls,
        demoId(k),
        role,
        new Date(now.getTime() - 400 * DAY),
      ]);
    }
    await tx.query(
      `insert into crews (id, name, emoji, kind, tz, created_by, is_demo, created_at, reunion_label, reunion_at) values ($1, 'Carleton ''22', '🎓', 'long_distance', $2, $3, true, $4, 'Lake house 🏡', $5)`,
      [
        DEMO_CREWS.college,
        DEMO_TZ,
        demoId("maya"),
        new Date(now.getTime() - 300 * DAY),
        new Date(now.getTime() + 23 * DAY),
      ],
    );
    for (const [k, role] of [
      ["maya", "owner"],
      ["theo", "member"],
      ["priya", "member"],
      ["devin", "member"],
    ] as const) {
      await tx.query(`insert into crew_members (crew_id, user_id, role, joined_at) values ($1, $2, $3, $4)`, [
        DEMO_CREWS.college,
        demoId(k),
        role,
        new Date(now.getTime() - 300 * DAY),
      ]);
    }
  });

  async function pastNight(
    tx: Queryable,
    crewId: string,
    start: Date,
    title: string,
    venue: string,
    people: DemoKey[],
    perPerson: number[],
    city = "Minneapolis",
  ) {
    const s = computeNightSchedule(start, DEMO_TZ);
    const id = (
      await tx.query<{ id: string }>(
        `insert into nights (crew_id, kind, title, venue_label, city, tz, started_by, started_at, auto_end_at, unlock_at, earliest_unlock_at, ended_at, unlocked_at, unlock_reason, roll_size, is_demo)
         values ($1, 'night', $2, $3, $4, $5, $6, $7, $8, $9, $10, $8, $9, 'scheduled', 24, true) returning id`,
        [
          crewId,
          title,
          venue,
          city,
          DEMO_TZ,
          demoId(people[0]!),
          start,
          s.autoEndAt,
          s.unlockAt,
          s.earliestUnlockAt,
        ],
      )
    ).rows[0]!.id;
    const shots: { id: string; author: DemoKey }[] = [];
    for (const [i, p] of people.entries()) {
      await tx.query(
        `insert into night_members (night_id, user_id, via, joined_at, ready_at) values ($1, $2, $3, $4, $5)`,
        [
          id,
          demoId(p),
          i === 0 ? "starter" : "crew",
          new Date(start.getTime() + i * 10 * MINUTE),
          s.earliestUnlockAt,
        ],
      );
      for (let k = 0; k < (perPerson[i] ?? 0); k++) {
        const photo = nextPhoto();
        if (!photo) continue;
        const sid = deps.random.uuid();
        const key = `demo/${id}/${sid}.jpg`;
        await deps.media.put(key, photo.bytes, "image/jpeg");
        const takenAt = new Date(start.getTime() + (30 + ((k * 37 + i * 11) % 300)) * MINUTE);
        await tx.query(
          `insert into shots (id, night_id, author_id, media_key, width, height, taken_at, status, is_demo) values ($1, $2, $3, $4, 720, 960, $5, 'kept', true)`,
          [sid, id, demoId(p), key, takenAt],
        );
        shots.push({ id: sid, author: p });
        shotCount++;
      }
    }
    return { id, shots };
  }

  await asService(deps.db, async (tx) => {
    // 1. Jules's birthday, last Saturday. Theo tagged Maya in two photos (pending: her call).
    const bday = await pastNight(
      tx,
      DEMO_CREWS.owls,
      lastSaturdayNight(now),
      "Jules's birthday 🎂",
      "The Nook",
      ["jules", "maya", "theo", "sam"],
      [5, 6, 7, 3],
    );
    const theoShots = bday.shots.filter((s) => s.author === "theo");
    for (const s of theoShots.slice(0, 2)) {
      await tx.query(
        `insert into shot_tags (shot_id, subject_id, tagger_id, status, created_at, updated_at) values ($1, $2, $3, 'pending', $4, $4)`,
        [s.id, demoId("maya"), demoId("theo"), now],
      );
    }
    for (const [i, s] of bday.shots.entries()) {
      const who = (["maya", "theo", "jules", "sam"] as const)[i % 4]!;
      if (who !== s.author && i % 3 !== 2)
        await tx.query(
          `insert into reactions (shot_id, user_id, emoji) values ($1, $2, $3) on conflict do nothing`,
          [s.id, demoId(who), ["🔥", "😂", "😍", "🌅", "🫶"][i % 5]],
        );
    }
    await tx.query(
      `insert into notifications (user_id, kind, payload, created_at) values ($1, 'tagged', $2, $3)`,
      [demoId("maya"), JSON.stringify({ night_id: bday.id, by: demoId("theo"), count: 2 }), now],
    );

    // 2. Two weeks ago: a dive-bar crawl.
    await pastNight(
      tx,
      DEMO_CREWS.owls,
      localAt(now, 15, 20, 30),
      "Dive bar crawl",
      "Grumpy's → Palmer's",
      ["theo", "maya", "jules"],
      [4, 4, 3],
    );

    // 3. One year ago tonight (powers "On this night").
    await pastNight(
      tx,
      DEMO_CREWS.owls,
      localAt(now, 365, 21),
      "Dinkytown, the legend",
      "Kollege Klub",
      ["maya", "theo", "jules", "sam"],
      [3, 3, 2, 2],
    );

    // 4. Carleton '22: weekly moments (one shot each). Devin (new dad) missed the last three → nudge.
    const windows = pastMoments(now, DEMO_TZ, 4, DEFAULT_MOMENT);
    for (const [w, win] of windows.entries()) {
      const posters: DemoKey[] = w === 3 ? ["maya", "theo", "priya", "devin"] : ["maya", "theo", "priya"];
      const id = (
        await tx.query<{ id: string }>(
          `insert into nights (crew_id, kind, title, tz, started_by, started_at, auto_end_at, unlock_at, earliest_unlock_at, ended_at, unlocked_at, unlock_reason, roll_size, is_demo)
           values ($1, 'moment', 'Nightcap', $2, null, $3, $4, $4, $4, $4, $4, 'window_closed', 1, true) returning id`,
          [DEMO_CREWS.college, DEMO_TZ, win.opensAt, win.closesAt],
        )
      ).rows[0]!.id;
      for (const p of ["maya", "theo", "priya", "devin"] as const) {
        await tx.query(
          `insert into night_members (night_id, user_id, via, joined_at) values ($1, $2, 'moment', $3)`,
          [id, demoId(p), win.opensAt],
        );
      }
      for (const [i, p] of posters.entries()) {
        const photo = nextPhoto();
        if (!photo) continue;
        const sid = deps.random.uuid();
        const key = `demo/${id}/${sid}.jpg`;
        await deps.media.put(key, photo.bytes, "image/jpeg");
        await tx.query(
          `insert into shots (id, night_id, author_id, media_key, width, height, taken_at, status, is_demo) values ($1, $2, $3, $4, 720, 960, $5, 'kept', true)`,
          [sid, id, demoId(p), key, new Date(win.opensAt.getTime() + (10 + i * 17) * MINUTE)],
        );
        shotCount++;
      }
    }

    // 5. Parallel night: Priya out in Chicago with the college crew last Saturday.
    await pastNight(
      tx,
      DEMO_CREWS.college,
      lastSaturdayNight(now),
      "Chicago, Priya edition",
      "The Whistler",
      ["priya", "maya"],
      [4, 1],
      "Chicago",
    );
  });

  await seedCityEvents(deps, now);
  deps.log?.(`seeded demo world: ${DEMO_USERS.length} people, 2 crews, ${shotCount} shots`);
  return { shots: shotCount };
}

/** Upcoming curated City Nights in Minneapolis (public venues), with demo strangers signed up. */
export async function seedCityEvents(deps: Deps, now: Date) {
  const has = await asService(
    deps.db,
    async (tx) =>
      (await tx.query(`select to_regclass('public.city_events') as t`)).rows[0] as { t: string | null },
  );
  if (!has.t) return;
  const at = (daysAhead: number, hour: number) =>
    zonedToInstant({ ...addLocalDays(localParts(now, DEMO_TZ), daysAhead), hour }, DEMO_TZ);
  const events = [
    {
      id: "e0000000-0000-4000-8000-000000000001",
      title: "Trivia Table",
      theme: "trivia",
      venue: "The Nook",
      area: "St. Paul",
      startsAt: new Date(now.getTime() + 3 * HOUR),
      min: 4,
      max: 6,
    },
    {
      id: "e0000000-0000-4000-8000-000000000002",
      title: "Karaoke Night",
      theme: "karaoke",
      venue: "Otter's Saloon",
      area: "Northeast",
      startsAt: at(2, 20),
      min: 4,
      max: 6,
    },
    {
      id: "e0000000-0000-4000-8000-000000000003",
      title: "Dive Bar Crawl",
      theme: "crawl",
      venue: "Grumpy's Bar",
      area: "Downtown",
      startsAt: at(4, 20),
      min: 4,
      max: 8,
    },
    {
      id: "e0000000-0000-4000-8000-000000000004",
      title: "Live Music & Mingle",
      theme: "music",
      venue: "Palmer's Bar",
      area: "Cedar-Riverside",
      startsAt: at(6, 21),
      min: 4,
      max: 6,
    },
  ];
  await asService(deps.db, async (tx) => {
    for (const e of events) {
      await tx.query(
        `insert into city_events (id, city, title, theme, venue_name, venue_area, starts_at, table_min, table_max, is_demo) values ($1, 'minneapolis', $2, $3, $4, $5, $6, $7, $8, true)`,
        [e.id, e.title, e.theme, e.venue, e.area, e.startsAt, e.min, e.max],
      );
    }
    // Five strangers already signed up for tonight's trivia; Maya can make it six.
    for (const k of ["ava", "noah", "lena", "marcus", "zoe"] as const) {
      await tx.query(
        `insert into city_signups (event_id, user_id, block_id, created_at) values ($1, $2, gen_random_uuid(), $3)`,
        [events[0]!.id, demoId(k), now],
      );
    }
    for (const k of ["ava", "lena"] as const) {
      await tx.query(
        `insert into city_signups (event_id, user_id, block_id, created_at) values ($1, $2, gen_random_uuid(), $3)`,
        [events[1]!.id, demoId(k), now],
      );
    }
  });
}
