// Dev-only routes (ADR 0005). Mounted ONLY in mock mode; app.test asserts they 404 otherwise.
import { checkAge, isValidTimeZone, localParts, nextLocalTime, phaseOf } from "@nightcap/core";
import { asService, asUser, makeUser } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import { mintToken } from "../auth";
import type { AppEnv } from "../deps";
import { body, fail, MESSAGES, param } from "../http";
import { advance, type NightRow } from "../services/nights";
import { tick } from "../services/tick";
import { DEMO_USERS, isSeeded, seedDemo, wipeDemo } from "../services/seed";
import { takeShot } from "./nights";

export const dev = new Hono<AppEnv>();

dev.get("/users", async (c) => {
  return c.json({
    users: DEMO_USERS.filter((u) => ["maya", "theo", "jules", "sam", "priya", "devin"].includes(u.key)).map(
      (u) => ({ id: u.id, name: u.name, hue: u.hue, city: u.city }),
    ),
  });
});

dev.post("/login", async (c) => {
  const deps = c.get("deps");
  const { userId } = await body(c, z.object({ userId: z.string().uuid() }));
  const exists = await asService(
    deps.db,
    async (tx) => (await tx.query(`select 1 from profiles where id = $1`, [userId])).rows.length > 0,
  );
  if (!exists) fail(404, "not_found");
  return c.json({ token: mintToken(deps, userId), userId });
});

dev.post("/signup", async (c) => {
  const deps = c.get("deps");
  const p = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(30),
      birthdate: z.string(),
      tz: z.string().max(64).refine(isValidTimeZone, "unknown time zone").default("America/Chicago"),
    }),
  );
  const age = checkAge(p.birthdate, deps.clock.now(), p.tz);
  if (!age.ok)
    fail(
      age.error === "under_21" ? 403 : 422,
      age.error,
      age.error === "under_21" ? MESSAGES.under_21 : "That date doesn't look right.",
    );
  const id = deps.random.uuid();
  await makeUser(deps.db, p.name, {
    id,
    birthdate: p.birthdate,
    tz: p.tz,
    hue: Math.floor(deps.random.float() * 360),
  });
  return c.json({ token: mintToken(deps, id), userId: id }, 201);
});

dev.get("/clock", (c) => {
  const deps = c.get("deps");
  return c.json({ now: deps.clock.now().toISOString(), offsetMs: deps.devClock?.offsetMs ?? 0 });
});

/** Time travel: { jump: "morning" (next 07:05) | "unlock" (next 10:00) | "reset" } or { offsetMs }. */
dev.post("/clock", async (c) => {
  const deps = c.get("deps");
  const p = await body(
    c,
    z.object({
      jump: z.enum(["morning", "unlock", "reset", "hour"]).optional(),
      offsetMs: z.number().optional(),
      tz: z.string().refine(isValidTimeZone, "unknown time zone").default("America/Chicago"),
    }),
  );
  if (!deps.devClock) fail(501, "not_configured");
  const base = deps.clock.now().getTime() - deps.devClock!.offsetMs;
  if (p.jump === "reset") deps.devClock!.setOffset(0);
  else if (p.jump === "hour") deps.devClock!.setOffset(deps.devClock!.offsetMs + 3_600_000);
  else if (p.jump) {
    const target = nextLocalTime(
      deps.clock.now(),
      p.tz,
      p.jump === "morning" ? 7 : 10,
      p.jump === "morning" ? 5 : 0,
      true,
    );
    deps.devClock!.setOffset(target.getTime() + 1000 - base);
  } else if (p.offsetMs !== undefined) deps.devClock!.setOffset(p.offsetMs);
  const changed = await tick(deps);
  return c.json({
    now: deps.clock.now().toISOString(),
    offsetMs: deps.devClock!.offsetMs,
    local: localParts(deps.clock.now(), p.tz),
    advanced: changed,
  });
});

/** The other people in the night act: join (crew members), snap demo photos, say "I'm good". */
dev.post("/nights/:id/simulate", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const nightId = param(c, "id");
  const p = await body(
    c,
    z.object({
      shots: z.number().int().min(0).max(24).default(4),
      join: z.boolean().default(true),
      ready: z.boolean().default(false),
    }),
  );
  await advance(deps, nightId);
  const night = await asService(
    deps.db,
    async (tx) => (await tx.query<NightRow>(`select * from nights where id = $1`, [nightId])).rows[0],
  );
  if (!night) fail(404, "not_found");
  const visible = await asUser(
    deps.db,
    userId,
    async (tx) => (await tx.query(`select 1 from nights where id = $1`, [nightId])).rows.length > 0,
  );
  if (!visible) fail(404, "not_found");
  const phase = phaseOf({ endedAt: night!.ended_at, unlockedAt: night!.unlocked_at });
  const demoIds = new Set<string>(DEMO_USERS.map((u) => u.id));
  const others = await asService(deps.db, async (tx) => {
    const members = (
      await tx.query<{ user_id: string }>(`select user_id from night_members where night_id = $1`, [nightId])
    ).rows.map((r) => r.user_id);
    const crew = night!.crew_id
      ? (
          await tx.query<{ user_id: string }>(`select user_id from crew_members where crew_id = $1`, [
            night!.crew_id,
          ])
        ).rows.map((r) => r.user_id)
      : [];
    return { members, crew };
  });
  const photos = (await deps.demoPhotos?.()) ?? [];
  const actions: string[] = [];
  const actors = new Set(others.members);
  if (p.join && phase === "live") {
    for (const u of others.crew) {
      if (u === userId || actors.has(u) || !demoIds.has(u)) continue;
      try {
        await asUser(deps.db, u, (tx) =>
          tx.query(`select join_crew_night($1, $2)`, [nightId, deps.clock.now()]),
        );
        actors.add(u);
        actions.push(`${u.slice(0, 4)} joined`);
      } catch {
        /* already in another night, blocked, etc. */
      }
    }
  }
  let k = Math.floor(deps.random.float() * 1000);
  for (const u of actors) {
    if (u === userId || !demoIds.has(u)) continue;
    if (phase === "live") {
      for (let i = 0; i < p.shots && photos.length; i++) {
        try {
          await takeShot(deps, u, nightId, photos[k++ % photos.length]!.bytes);
        } catch {
          break; // roll full or night ended
        }
      }
      actions.push(`${u.slice(0, 4)} shot ${p.shots}`);
    }
    if (p.ready && phase === "developing") {
      try {
        await asUser(deps.db, u, (tx) => tx.query(`select mark_ready($1, $2)`, [nightId, deps.clock.now()]));
        actions.push(`${u.slice(0, 4)} ready`);
      } catch {
        /* not developing */
      }
    }
  }
  await advance(deps, nightId);
  return c.json({ ok: true, actions });
});

dev.get("/sample/:n", async (c) => {
  const deps = c.get("deps");
  const photos = (await deps.demoPhotos?.()) ?? [];
  if (!photos.length) fail(404, "not_found", "No demo photos. Run `make setup` (scripts/gen-photos.mjs).");
  const n = Math.abs(Number(c.req.param("n")) || 0) % photos.length;
  return new Response(photos[n]!.bytes, {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" },
  });
});

dev.post("/reseed", async (c) => {
  const deps = c.get("deps");
  deps.devClock?.setOffset(0);
  if (await isSeeded(deps)) await wipeDemo(deps);
  const r = await seedDemo(deps);
  return c.json({ ok: true, ...r });
});

/**
 * The moderation queue, mock mode only (privacy review C2). In production this is a moderator
 * tool with SLAs, under_18 escalation (NCMEC) and NCII hash-sharing; see STATUS.
 */
dev.get("/reports", async (c) => {
  const deps = c.get("deps");
  const rows = await asService(
    deps.db,
    async (tx) =>
      (
        await tx.query<{
          id: string;
          reason: string;
          status: string;
          created_at: Date;
          shot_id: string | null;
          reported_user_snapshot: string | null;
          evidence: boolean | null;
        }>(
          `select r.id, r.reason, r.status, r.created_at, r.shot_id, r.reported_user_snapshot, s.evidence_hold as evidence
       from reports r left join shots s on s.id = r.shot_id where r.status = 'open' order by r.created_at desc limit 100`,
        )
      ).rows,
  );
  return c.json({
    reports: rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      shotId: r.shot_id,
      reportedUser: r.reported_user_snapshot,
      evidenceHeld: !!r.evidence,
    })),
  });
});
