import {
  computeNightSchedule,
  deferUntil,
  describeMoment,
  generateNightCode,
  inviteExpiry,
  inviteLinks,
  inviteTokenFromBytes,
  INVITE_TOKEN_BYTES,
  NIGHT_RULES,
  phaseOf,
  shouldDefer,
  validateCrewName,
  type SensitiveAction,
} from "@nightcap/core";
import { asService, asUser, dbErrorCode } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, Deps } from "../deps";
import { body, fail, param } from "../http";
import { signMediaPath } from "../media/sign";
import { advance, nightView } from "../services/nights";
import { loadMe, nightModeFor, sha256 } from "../services/util";
import { executeDeferred } from "../services/deferred";

export const crews = new Hono<AppEnv>();

interface CrewRow {
  id: string;
  name: string;
  emoji: string;
  kind: "local" | "long_distance";
  tz: string;
  moment_weekday: number;
  moment_hour: number;
  moment_minute: number;
  moment_duration_min: number;
  reunion_label: string | null;
  reunion_at: Date | null;
  created_by: string;
  is_demo: boolean;
}

async function crewSummary(deps: Deps, userId: string, crewIds?: string[]) {
  const nowSec = Math.floor(deps.clock.now().getTime() / 1000);
  return asUser(deps.db, userId, async (tx) => {
    const crewsRows = (
      await tx.query<CrewRow & { role: string }>(
        `select c.*, m.role from crews c join crew_members m on m.crew_id = c.id and m.user_id = $1
         ${crewIds ? "where c.id = any($2)" : ""} order by c.created_at`,
        crewIds ? [userId, crewIds] : [userId],
      )
    ).rows;
    const ids = crewsRows.map((c) => c.id);
    if (!ids.length) return [];
    const members = (
      await tx.query<{
        crew_id: string;
        user_id: string;
        role: string;
        display_name: string;
        avatar_hue: number;
        city: string | null;
      }>(
        `select m.crew_id, m.user_id, m.role, p.display_name, p.avatar_hue, p.city from crew_members m join profiles p on p.id = m.user_id
         where m.crew_id = any($1) order by m.joined_at`,
        [ids],
      )
    ).rows;
    const nights = (
      await tx.query<{
        id: string;
        crew_id: string;
        kind: string;
        title: string | null;
        venue_label: string | null;
        started_at: Date;
        started_by: string | null;
        ended_at: Date | null;
        unlocked_at: Date | null;
        unlock_at: Date;
        tz: string;
        is_demo: boolean;
      }>(
        `select id, crew_id, kind, title, venue_label, started_at, started_by, ended_at, unlocked_at, unlock_at, tz, is_demo from nights
         where crew_id = any($1) order by started_at desc`,
        [ids],
      )
    ).rows;
    const nightIds = nights.map((n) => n.id);
    const mine = new Set(
      nightIds.length
        ? (
            await tx.query<{ night_id: string }>(
              `select night_id from night_members where user_id = $1 and night_id = any($2)`,
              [userId, nightIds],
            )
          ).rows.map((r) => r.night_id)
        : [],
    );
    // Covers: the first visible shot per unlocked night I was in (RLS decides "visible").
    const covers = nightIds.length
      ? (
          await tx.query<{ night_id: string; id: string; n: number }>(
            `select distinct on (s.night_id) s.night_id, s.id, (select count(*)::int from shots x where x.night_id = s.night_id) as n
           from shots s join nights n on n.id = s.night_id
           where s.night_id = any($1) and n.unlocked_at is not null and s.status in ('held','kept')
           order by s.night_id, s.taken_at`,
            [nightIds],
          )
        ).rows
      : [];
    const counts = nightIds.length
      ? (
          await tx.query<{ night_id: string; n: number; people: number }>(
            `select night_id, count(*)::int as n, count(distinct user_id)::int as people from night_members where night_id = any($1) group by night_id`,
            [nightIds],
          )
        ).rows
      : [];
    return crewsRows.map((c) => {
      const cn = nights.filter((n) => n.crew_id === c.id);
      const live = cn.find((n) => n.kind === "night" && !n.ended_at) ?? null;
      const albums = cn
        .filter((n) => n.kind !== "moment" && mine.has(n.id) && n.id !== live?.id)
        .map((n) => {
          const cover = covers.find((x) => x.night_id === n.id);
          return {
            id: n.id,
            title: n.title,
            venue: n.venue_label,
            startedAt: n.started_at.toISOString(),
            phase: phaseOf({ endedAt: n.ended_at, unlockedAt: n.unlocked_at }),
            unlockAt: n.unlock_at.toISOString(),
            people: counts.find((x) => x.night_id === n.id)?.people ?? 0,
            coverUrl: cover ? signMediaPath(deps.config.mediaSecret, cover.id, userId, nowSec) : null,
            isDemo: n.is_demo,
          };
        });
      return {
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        kind: c.kind,
        tz: c.tz,
        myRole: c.role,
        moment: {
          weekday: c.moment_weekday,
          hour: c.moment_hour,
          minute: c.moment_minute,
          durationMinutes: c.moment_duration_min,
          label: describeMoment({
            weekday: c.moment_weekday,
            hour: c.moment_hour,
            minute: c.moment_minute,
            durationMinutes: c.moment_duration_min,
          }),
        },
        reunion:
          c.reunion_label && c.reunion_at ? { label: c.reunion_label, at: c.reunion_at.toISOString() } : null,
        members: members
          .filter((m) => m.crew_id === c.id)
          .map((m) => ({
            id: m.user_id,
            name: m.display_name,
            hue: m.avatar_hue,
            role: m.role,
            city: m.city,
          })),
        liveNight: live
          ? {
              id: live.id,
              title: live.title,
              startedBy: live.started_by,
              startedAt: live.started_at.toISOString(),
              joined: mine.has(live.id),
              people: counts.find((x) => x.night_id === live.id)?.people ?? 0,
            }
          : null,
        albums,
        isDemo: c.is_demo,
      };
    });
  });
}

crews.get("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  // Bring live nights up to date first so a 5am auto-end shows as developing.
  const live = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (
        await tx.query<{ id: string }>(
          `select n.id from nights n join crew_members m on m.crew_id = n.crew_id and m.user_id = $1 where n.unlocked_at is null`,
          [userId],
        )
      ).rows,
  );
  for (const n of live) await advance(deps, n.id);
  return c.json({ crews: await crewSummary(deps, userId) });
});

const NewCrew = z.object({
  name: z.string(),
  emoji: z.string().min(1).max(8).optional(),
  kind: z.enum(["local", "long_distance"]).optional(),
});

crews.post("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const p = await body(c, NewCrew);
  const name = validateCrewName(p.name);
  if (!name.ok)
    fail(
      422,
      "invalid",
      name.error === "too_short" ? "Give your crew a name." : "That name's a bit long (40 max).",
    );
  const me = await loadMe(deps, userId);
  const id = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (
        await tx.query<{ id: string }>(`select create_crew($1, $2, $3, $4, $5) as id`, [
          name.ok ? name.value : "",
          p.emoji ?? "🌙",
          p.kind ?? "local",
          me?.tz ?? "America/Chicago",
          deps.clock.now(),
        ])
      ).rows[0]!.id,
  );
  const [crew] = await crewSummary(deps, userId, [id]);
  return c.json({ crew }, 201);
});

crews.get("/:id", async (c) => {
  const deps = c.get("deps");
  const [crew] = await crewSummary(deps, c.get("userId"), [param(c, "id")]);
  if (!crew) fail(404, "not_found");
  return c.json({ crew });
});

const PatchCrew = z
  .object({
    name: z.string(),
    emoji: z.string().min(1).max(8),
    kind: z.enum(["local", "long_distance"]),
    reunionLabel: z.string().trim().max(40).nullable(),
    reunionAt: z.string().datetime().nullable(),
    moment: z.object({
      weekday: z.number().int().min(0).max(6),
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      durationMinutes: z.number().int().min(30).max(1440),
    }),
  })
  .partial()
  .strict();

crews.patch("/:id", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const p = await body(c, PatchCrew);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length + 1}`);
  };
  if (p.name !== undefined) {
    const n = validateCrewName(p.name);
    if (!n.ok) fail(422, "invalid", "Crew names are 1–40 characters.");
    set("name", n.ok ? n.value : "");
  }
  if (p.emoji !== undefined) set("emoji", p.emoji);
  if (p.kind !== undefined) set("kind", p.kind);
  if (p.reunionLabel !== undefined) set("reunion_label", p.reunionLabel);
  if (p.reunionAt !== undefined) set("reunion_at", p.reunionAt ? new Date(p.reunionAt) : null);
  if (p.moment) {
    set("moment_weekday", p.moment.weekday);
    set("moment_hour", p.moment.hour);
    set("moment_minute", p.moment.minute);
    set("moment_duration_min", p.moment.durationMinutes);
  }
  if (!sets.length) return c.json({ ok: true });
  // Reunion is anyone's to set (social); everything else is owner-only (RLS: crews_update_owner).
  const ownerOnly = Object.keys(p).some((k) => !["reunionLabel", "reunionAt"].includes(k));
  const updated = await (ownerOnly
    ? asUser(
        deps.db,
        userId,
        async (tx) =>
          (await tx.query(`update crews set ${sets.join(", ")} where id = $1 returning id`, [id, ...vals]))
            .rows.length,
      )
    : asService(
        deps.db,
        async (tx) =>
          (
            await tx.query(
              `update crews set ${sets.join(", ")} where id = $1 and exists (select 1 from crew_members where crew_id = $1 and user_id = $${vals.length + 2}) returning id`,
              [id, ...vals, userId],
            )
          ).rows.length,
      ));
  if (!updated) fail(403, "not_allowed", "Only the crew owner can change that.");
  const [crew] = await crewSummary(deps, userId, [id]);
  return c.json({ crew });
});

crews.post("/:id/invites", async (c) => {
  const deps = c.get("deps");
  const id = param(c, "id");
  const token = inviteTokenFromBytes(deps.random.bytes(INVITE_TOKEN_BYTES));
  const now = deps.clock.now();
  const expiresAt = inviteExpiry("crew", now);
  await asUser(deps.db, c.get("userId"), (tx) =>
    tx.query(`select create_invite('crew', $1, $2, $3, null, $4)`, [id, sha256(token), expiresAt, now]),
  );
  return c.json({ token, links: inviteLinks(token), expiresAt: expiresAt.toISOString() }, 201);
});

/** Leave (yourself) or remove (owner). Deferred to the morning in night mode (DRUNK_UX). */
crews.delete("/:id/members/:userId", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const crewId = param(c, "id");
  const target = param(c, "userId");
  const action: SensitiveAction = target === userId ? "leave_crew" : "remove_member";
  const me = await loadMe(deps, userId);
  const role = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (await tx.query<{ r: string | null }>(`select crew_role($1) as r`, [crewId])).rows[0]?.r ?? null,
  );
  if (!role) fail(404, "not_found");
  if (action === "remove_member" && role !== "owner")
    fail(403, "not_allowed", "Only the crew owner can remove people.");
  if (shouldDefer(action, await nightModeFor(deps, me!))) {
    const askAt = deferUntil(deps.clock.now(), me!.tz);
    await asService(deps.db, (tx) =>
      tx.query(
        `insert into deferred_actions (user_id, action, payload, created_at, ask_at) values ($1, $2, $3, $4, $5)`,
        [userId, action, JSON.stringify({ crewId, userId: target }), deps.clock.now(), askAt],
      ),
    );
    return c.json(
      {
        deferred: true,
        askAt: askAt.toISOString(),
        message: "It's late. We'll ask you again in the morning.",
      },
      202,
    );
  }
  await executeDeferred(deps, userId, action, { crewId, userId: target });
  return c.json({ ok: true });
});

const StartNight = z
  .object({ title: z.string().trim().max(60).optional(), venue: z.string().trim().max(60).optional() })
  .strict();

crews.post("/:id/nights", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const crewId = param(c, "id");
  const p = await body(c, StartNight);
  const now = deps.clock.now();
  const crewTz = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (await tx.query<{ tz: string }>(`select tz from crews where id = $1`, [crewId])).rows[0]?.tz,
  );
  if (!crewTz) fail(404, "not_found");
  const me = await loadMe(deps, userId);
  const tz = me?.tz ?? crewTz!;
  const s = computeNightSchedule(now, tz);
  let nightId: string | null = null;
  for (let attempt = 0; attempt < 40 && !nightId; attempt++) {
    const code = generateNightCode(deps.random.float);
    try {
      nightId = await asUser(
        deps.db,
        userId,
        async (tx) =>
          (
            await tx.query<{ id: string }>(
              `select start_night($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as id`,
              [
                crewId,
                p.title ?? null,
                p.venue ?? null,
                tz,
                now,
                s.autoEndAt,
                s.unlockAt,
                s.earliestUnlockAt,
                code,
                NIGHT_RULES.rollSize,
              ],
            )
          ).rows[0]!.id,
      );
    } catch (e) {
      if (dbErrorCode(e) !== "conflict") throw e; // code collision → try another code
    }
  }
  if (!nightId) fail(503, "busy", "Couldn't find a free night code. Try again.");
  return c.json({ night: await nightView(deps, userId, nightId!) }, 201);
});
