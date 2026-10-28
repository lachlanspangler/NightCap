// City Nights (MEET_PEOPLE.md): opt-in, verified, public venues, tables, mutual keep-in-touch.
import {
  canJoinCityNights,
  CITIES,
  CITY_RULES,
  CODE_OF_CONDUCT,
  computeNightSchedule,
  formTables,
  pairSet,
  tableRevealed,
  type Gender,
  type SignupBlock,
} from "@nightcap/core";
import { asService, asUser } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../deps";
import { body, fail, param } from "../http";
import { loadMe } from "../services/util";

export const city = new Hono<AppEnv>();

interface EventRow {
  id: string;
  city: string;
  title: string;
  theme: string;
  venue_name: string;
  venue_area: string | null;
  starts_at: Date;
  table_min: number;
  table_max: number;
  tables_formed_at: Date | null;
  is_demo: boolean;
}

async function gate(deps: Deps, userId: string) {
  const me = await loadMe(deps, userId);
  if (!me) fail(404, "no_profile");
  return {
    me: me!,
    result: canJoinCityNights({
      is21: me!.is_21_attested,
      ageVerified: !!me!.age_verified_at,
      cocAcceptedAt: me!.coc_accepted_at,
      cityOptIn: me!.city_opt_in,
    }),
  };
}

/** Seat everyone signed up for an event (idempotent). Creates one city night (shared roll) per table. */
export async function formTablesForEvent(deps: Deps, eventId: string) {
  return asService(deps.db, async (tx) => {
    const e = (await tx.query<EventRow>(`select * from city_events where id = $1 for update`, [eventId]))
      .rows[0];
    if (!e || e.tables_formed_at) return false;
    const signups = (
      await tx.query<{ user_id: string; block_id: string; gender: Gender }>(
        `select s.user_id, s.block_id, p.gender from city_signups s join profiles p on p.id = s.user_id where s.event_id = $1 order by s.created_at, s.user_id`,
        [eventId],
      )
    ).rows;
    const blocksById = new Map<string, SignupBlock>();
    for (const s of signups) {
      const b = blocksById.get(s.block_id) ?? { blockId: s.block_id, members: [] };
      b.members.push({ userId: s.user_id, gender: s.gender });
      blocksById.set(s.block_id, b);
    }
    const ids = signups.map((s) => s.user_id);
    const blocked = pairSet(
      (
        await tx.query<{ a: string; b: string }>(
          `select blocker_id as a, blocked_id as b from blocks where blocker_id = any($1) and blocked_id = any($1)`,
          [ids],
        )
      ).rows.map((r) => [r.a, r.b] as [string, string]),
    );
    const met = pairSet(
      (
        await tx.query<{ a: string; b: string }>(
          `select a.user_id as a, b.user_id as b from city_table_members a join city_table_members b on a.table_id = b.table_id and a.user_id < b.user_id
         where a.user_id = any($1) and b.user_id = any($1)`,
          [ids],
        )
      ).rows.map((r) => [r.a, r.b] as [string, string]),
    );
    const formed = formTables([...blocksById.values()], { min: e.table_min, max: e.table_max }, blocked, met);
    const tz = CITIES.find((c) => c.id === e.city)?.tz ?? "America/Chicago";
    const s = computeNightSchedule(e.starts_at, tz);
    for (const [i, t] of formed.tables.entries()) {
      const night = (
        await tx.query<{ id: string }>(
          `insert into nights (kind, title, venue_label, city, tz, started_by, started_at, auto_end_at, unlock_at, earliest_unlock_at, roll_size, is_demo)
           values ('city', $1, $2, $3, $4, null, $5, $6, $7, $8, 24, $9) returning id`,
          [
            e.title,
            e.venue_name,
            e.city,
            tz,
            e.starts_at,
            s.autoEndAt,
            s.unlockAt,
            s.earliestUnlockAt,
            e.is_demo,
          ],
        )
      ).rows[0]!.id;
      const table = (
        await tx.query<{ id: string }>(
          `insert into city_tables (event_id, night_id, seat_label) values ($1, $2, $3) returning id`,
          [eventId, night, `Table ${i + 1}`],
        )
      ).rows[0]!.id;
      for (const u of t.userIds) {
        await tx.query(`insert into city_table_members (table_id, user_id) values ($1, $2)`, [table, u]);
        await tx.query(
          `insert into night_members (night_id, user_id, via, joined_at) values ($1, $2, 'table', $3)`,
          [night, u, e.starts_at],
        );
      }
    }
    await tx.query(`update city_events set tables_formed_at = $2 where id = $1`, [eventId, deps.clock.now()]);
    deps.log?.(
      `city event ${eventId.slice(0, 8)}: ${formed.tables.length} tables, ${formed.waitlist.length} waitlisted`,
    );
    return true;
  });
}

async function eventView(deps: Deps, userId: string, e: EventRow) {
  const now = deps.clock.now();
  const revealed = tableRevealed(e.starts_at, now);
  if (revealed && !e.tables_formed_at) await formTablesForEvent(deps, e.id);
  return asUser(deps.db, userId, async (tx) => {
    const signedUp =
      (await tx.query(`select 1 from city_signups where event_id = $1 and user_id = $2`, [e.id, userId])).rows
        .length > 0;
    const count = (await tx.query<{ n: number }>(`select city_signup_count($1) as n`, [e.id])).rows[0]!.n;
    const table = (
      await tx.query<{ id: string; night_id: string | null; seat_label: string }>(
        `select t.id, t.night_id, t.seat_label from city_tables t join city_table_members m on m.table_id = t.id and m.user_id = $2 where t.event_id = $1`,
        [e.id, userId],
      )
    ).rows[0];
    const mates = table
      ? (
          await tx.query<{
            user_id: string;
            display_name: string;
            avatar_hue: number;
            fun_line: string | null;
          }>(
            `select m.user_id, p.display_name, p.avatar_hue, p.fun_line from city_table_members m join profiles p on p.id = m.user_id
           where m.table_id = $1 and m.left_at is null order by p.display_name`,
            [table.id],
          )
        ).rows
      : [];
    const answers = table
      ? (
          await tx.query<{ to_user_id: string; yes: boolean }>(
            `select to_user_id, yes from keep_in_touch where event_id = $1`,
            [e.id],
          )
        ).rows
      : [];
    return {
      id: e.id,
      city: e.city,
      title: e.title,
      theme: e.theme,
      venue: e.venue_name,
      area: e.venue_area,
      startsAt: e.starts_at.toISOString(),
      revealAt: new Date(e.starts_at.getTime() - CITY_RULES.revealBeforeMs).toISOString(),
      tableMin: e.table_min,
      tableMax: e.table_max,
      signedUp,
      count,
      revealed,
      waitlisted: revealed && !!e.tables_formed_at && signedUp && !table,
      table: table
        ? {
            id: table.id,
            label: table.seat_label,
            nightId: table.night_id,
            people: mates.map((m) => ({
              id: m.user_id,
              name: m.display_name,
              hue: m.avatar_hue,
              funLine: m.fun_line,
              me: m.user_id === userId,
              keepInTouch: answers.find((a) => a.to_user_id === m.user_id)?.yes ?? null,
            })),
          }
        : null,
      isDemo: e.is_demo,
    };
  });
}

city.get("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const g = await gate(deps, userId);
  const events = g.result.ok
    ? await asUser(
        deps.db,
        userId,
        async (tx) =>
          (
            await tx.query<EventRow>(
              `select * from city_events where city = $1 and starts_at > $2 order by starts_at limit 20`,
              [
                g.me.city?.toLowerCase().replace("new york", "nyc") ?? "minneapolis",
                new Date(deps.clock.now().getTime() - 6 * 3_600_000),
              ],
            )
          ).rows,
      )
    : [];
  const views = [];
  for (const e of events) views.push(await eventView(deps, userId, e));
  return c.json({
    gate: g.result.ok ? { ok: true } : { ok: false, missing: g.result.error },
    city: g.me.city,
    cities: CITIES,
    codeOfConduct: CODE_OF_CONDUCT,
    events: views,
  });
});

/** Opt in: choose a city and accept the code of conduct. Age verification is separate (stubbed). */
city.post("/join", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const p = await body(
    c,
    z.object({ city: z.enum(["minneapolis", "chicago", "nyc"]), acceptCodeOfConduct: z.literal(true) }),
  );
  const name = CITIES.find((x) => x.id === p.city)!.name;
  await asUser(deps.db, userId, (tx) =>
    tx.query(`update profiles set city = $2, city_opt_in = true, coc_accepted_at = $3 where id = $1`, [
      userId,
      name,
      deps.clock.now(),
    ]),
  );
  return c.json({ ok: true });
});

city.post("/leave", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  await asUser(deps.db, userId, (tx) =>
    tx.query(`update profiles set city_opt_in = false where id = $1`, [userId]),
  );
  return c.json({ ok: true });
});

city.get("/events/:id", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const e = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (await tx.query<EventRow>(`select * from city_events where id = $1`, [param(c, "id")])).rows[0],
  );
  if (!e) fail(404, "not_found");
  return c.json({ event: await eventView(deps, userId, e!) });
});

/**
 * Sign up yourself. To sit with crewmates, invite them (`inviteFriendIds`); they then sign up with
 * `withUserId` = you. Nobody joins a group without being invited, and never across a block
 * (code review M1 #2).
 */
city.post("/events/:id/signup", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const p = await body(
    c,
    z.object({
      withUserId: z.string().uuid().optional(),
      inviteFriendIds: z
        .array(z.string().uuid())
        .max(CITY_RULES.maxBlockSize - 1)
        .optional(),
    }),
  );
  const g = await gate(deps, userId);
  if (!g.result.ok) fail(403, g.result.error, "Finish the City Nights checklist first.");
  let blockId = deps.random.uuid();
  if (p.withUserId) {
    const friend = await asService(deps.db, async (tx) => {
      const r = await tx.query<{ block_id: string; size: number; invited: boolean; blocked: boolean }>(
        `select s.block_id,
                (select count(*)::int from city_signups x where x.event_id = s.event_id and x.block_id = s.block_id) as size,
                exists (select 1 from city_block_invites i where i.event_id = s.event_id and i.block_id = s.block_id and i.invitee_id = $2) as invited,
                exists (select 1 from blocks b join city_signups m on m.event_id = s.event_id and m.block_id = s.block_id
                        where (b.blocker_id = $2 and b.blocked_id = m.user_id) or (b.blocker_id = m.user_id and b.blocked_id = $2)) as blocked
         from city_signups s where s.event_id = $1 and s.user_id = $3`,
        [id, userId, p.withUserId],
      );
      return r.rows[0];
    });
    // Same generic answer for "not signed up", "didn't invite you" and "blocked" (no oracle).
    if (!friend || !friend.invited || friend.blocked)
      fail(404, "not_found", "Ask your friend to invite you when they sign up.");
    if (friend!.size >= CITY_RULES.maxBlockSize)
      fail(409, "full", `Groups are up to ${CITY_RULES.maxBlockSize}.`);
    blockId = friend!.block_id;
  }
  await asUser(deps.db, userId, (tx) =>
    tx.query(
      `insert into city_signups (event_id, user_id, block_id, created_at) values ($1, $2, $3, $4) on conflict do nothing`,
      [id, userId, blockId, deps.clock.now()],
    ),
  );
  if (p.inviteFriendIds?.length) {
    await asService(deps.db, async (tx) => {
      const mine = (
        await tx.query<{ block_id: string }>(
          `select block_id from city_signups where event_id = $1 and user_id = $2`,
          [id, userId],
        )
      ).rows[0]!.block_id;
      for (const f of p.inviteFriendIds!) {
        const ok =
          (
            await tx.query(
              `select 1 from crew_members a join crew_members b on a.crew_id = b.crew_id
             where a.user_id = $1 and b.user_id = $2
               and not exists (select 1 from blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1))`,
              [userId, f],
            )
          ).rows.length > 0;
        if (ok)
          await tx.query(
            `insert into city_block_invites (event_id, block_id, inviter_id, invitee_id) values ($1, $2, $3, $4) on conflict do nothing`,
            [id, mine, userId, f],
          );
      }
    });
  }
  const e = await asUser(
    deps.db,
    userId,
    async (tx) => (await tx.query<EventRow>(`select * from city_events where id = $1`, [id])).rows[0],
  );
  return c.json({ event: await eventView(deps, userId, e!) }, 201);
});

city.delete("/events/:id/signup", async (c) => {
  const deps = c.get("deps");
  await asUser(deps.db, c.get("userId"), (tx) =>
    tx.query(`delete from city_signups where event_id = $1 and user_id = $2`, [
      param(c, "id"),
      c.get("userId"),
    ]),
  );
  return c.json({ ok: true });
});

/** After the night: "Keep in touch?" per tablemate. Contact opens only on a mutual yes. */
city.post("/events/:id/keep-in-touch", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const p = await body(c, z.object({ userId: z.string().uuid(), yes: z.boolean() }));
  if (p.userId === userId) fail(422, "invalid");
  await asUser(deps.db, userId, (tx) =>
    tx.query(
      `insert into keep_in_touch (event_id, from_user_id, to_user_id, yes, created_at) values ($1, $2, $3, $4, $5) on conflict (event_id, from_user_id, to_user_id) do update set yes = excluded.yes`,
      [id, userId, p.userId, p.yes, deps.clock.now()],
    ),
  );
  const matched = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (await tx.query(`select 1 from my_connections() where user_id = $1 and event_id = $2`, [p.userId, id]))
        .rows.length > 0,
  );
  return c.json({ ok: true, matched });
});

city.get("/connections", async (c) => {
  const deps = c.get("deps");
  const rows = await asUser(
    deps.db,
    c.get("userId"),
    async (tx) =>
      (
        await tx.query<{
          user_id: string;
          display_name: string;
          avatar_hue: number;
          event_id: string;
          since: Date;
        }>(`select * from my_connections() order by since desc`)
      ).rows,
  );
  return c.json({
    connections: rows.map((r) => ({
      userId: r.user_id,
      name: r.display_name,
      hue: r.avatar_hue,
      eventId: r.event_id,
      since: r.since.toISOString(),
    })),
  });
});

city.post("/tables/:id/leave", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  // Leaving revokes everything (code review #6): the seat, the names, and the table's roll.
  const tableId = param(c, "id");
  await asService(deps.db, async (tx) => {
    const t = (
      await tx.query<{ night_id: string | null }>(
        `select t.night_id from city_tables t join city_table_members m on m.table_id = t.id where t.id = $1 and m.user_id = $2`,
        [tableId, userId],
      )
    ).rows[0];
    if (!t) return;
    await tx.query(`delete from city_table_members where table_id = $1 and user_id = $2`, [tableId, userId]);
    if (t.night_id)
      await tx.query(`delete from night_members where night_id = $1 and user_id = $2`, [t.night_id, userId]);
  });
  return c.json({ ok: true });
});
