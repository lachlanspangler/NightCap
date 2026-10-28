import { checkAge, deferUntil, isValidTimeZone, shouldDefer } from "@nightcap/core";
import { asService, asUser } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps";
import { body, fail, param } from "../http";
import { liveNightOf, loadMe, nightModeFor } from "../services/util";
import { executeDeferred } from "../services/deferred";

export const me = new Hono<AppEnv>();

/**
 * Create your profile after signing in (prod path: Supabase phone/Apple auth gives the account,
 * this gives the profile). The 21+ gate lives here too, on the server clock (privacy review L1).
 */
me.post("/profile", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const p = await body(
    c,
    z.object({
      name: z.string().trim().min(1).max(30),
      birthdate: z.string(),
      tz: z.string().max(64).refine(isValidTimeZone, "unknown time zone"),
    }),
  );
  if (await loadMe(deps, userId)) fail(409, "conflict", "You already have a profile.");
  const age = checkAge(p.birthdate, deps.clock.now(), p.tz);
  if (!age.ok)
    fail(
      age.error === "under_21" ? 403 : 422,
      age.error,
      age.error === "under_21" ? "NightCap is for 21+." : "That date doesn't look right.",
    );
  await asService(deps.db, async (tx) => {
    await tx.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [userId]);
    await tx.query(
      `insert into profiles (id, display_name, birthdate, is_21_attested, tz) values ($1, $2, $3, true, $4)`,
      [userId, p.name, p.birthdate, p.tz],
    );
  });
  return c.json({ ok: true }, 201);
});

me.get("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const row = await loadMe(deps, userId);
  if (!row) fail(404, "no_profile", "Finish setting up your profile.");
  const live = await liveNightOf(deps, userId);
  const counts = await asUser(deps.db, userId, async (tx) => {
    const r = await tx.query<{ unread: number; tags: number; deferred: number }>(
      `select (select count(*)::int from notifications where user_id = $1 and read_at is null) as unread,
              (select count(*)::int from shot_tags where subject_id = $1 and status = 'pending') as tags,
              (select count(*)::int from deferred_actions where user_id = $1 and resolved_at is null) as deferred`,
      [userId],
    );
    return r.rows[0]!;
  });
  const now = deps.clock.now();
  return c.json({
    id: row!.id,
    name: row!.display_name,
    hue: row!.avatar_hue,
    city: row!.city,
    cityOptIn: row!.city_opt_in,
    gender: row!.gender,
    funLine: row!.fun_line,
    nightModePref: row!.night_mode_pref,
    tz: row!.tz,
    ageVerified: !!row!.age_verified_at,
    is21: row!.is_21_attested,
    codeOfConductAccepted: !!row!.coc_accepted_at,
    isDemo: row!.is_demo,
    nightMode: await nightModeFor(deps, row!),
    liveNight: live ? { id: live.id, crewId: live.crew_id, title: live.title } : null,
    unreadNotifications: counts.unread,
    pendingTags: counts.tags,
    pendingDeferred: counts.deferred,
    now: now.toISOString(),
    mode: deps.config.mode,
  });
});

const PatchMe = z
  .object({
    name: z.string().trim().min(1).max(30),
    hue: z.number().int().min(0).max(359),
    city: z.string().trim().max(40).nullable(),
    cityOptIn: z.boolean(),
    gender: z.enum(["woman", "man", "nonbinary", "unspecified"]),
    funLine: z.string().trim().max(80).nullable(),
    nightModePref: z.enum(["auto", "always", "never"]),
    tz: z.string().max(64),
    acceptCodeOfConduct: z.literal(true),
  })
  .partial()
  .strict();

me.patch("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const p = await body(c, PatchMe);
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length + 1}`);
  };
  if (p.name !== undefined) set("display_name", p.name);
  if (p.hue !== undefined) set("avatar_hue", p.hue);
  if (p.city !== undefined) set("city", p.city);
  if (p.cityOptIn !== undefined) set("city_opt_in", p.cityOptIn);
  if (p.gender !== undefined) set("gender", p.gender);
  if (p.funLine !== undefined) set("fun_line", p.funLine);
  if (p.nightModePref !== undefined) set("night_mode_pref", p.nightModePref);
  if (p.tz !== undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: p.tz });
    } catch {
      fail(422, "invalid", "Unknown time zone.");
    }
    set("tz", p.tz);
  }
  if (p.acceptCodeOfConduct) set("coc_accepted_at", deps.clock.now());
  if (sets.length)
    await asUser(deps.db, userId, (tx) =>
      tx.query(`update profiles set ${sets.join(", ")} where id = $1`, [userId, ...vals]),
    );
  return c.json({ ok: true });
});

/** ID verification is stubbed (PRIVACY_SAFETY): mock mode marks you verified; prod needs a provider. */
me.post("/verify-age", async (c) => {
  const deps = c.get("deps");
  if (deps.config.mode !== "mock") fail(501, "not_configured", "ID verification isn't set up yet.");
  await asService(deps.db, (tx) =>
    tx.query(`update profiles set age_verified_at = $2 where id = $1`, [c.get("userId"), deps.clock.now()]),
  );
  return c.json({ ok: true, verified: true, stub: true });
});

me.get("/notifications", async (c) => {
  const deps = c.get("deps");
  const rows = await asUser(
    deps.db,
    c.get("userId"),
    async (tx) =>
      (
        await tx.query<{
          id: string;
          kind: string;
          payload: Record<string, unknown>;
          created_at: Date;
          read_at: Date | null;
        }>(
          `select id, kind, payload, created_at, read_at from notifications order by created_at desc limit 50`,
        )
      ).rows,
  );
  return c.json({
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload,
      createdAt: r.created_at.toISOString(),
      read: !!r.read_at,
    })),
  });
});

me.post("/notifications/read", async (c) => {
  const deps = c.get("deps");
  await asUser(deps.db, c.get("userId"), (tx) =>
    tx.query(`update notifications set read_at = $1 where read_at is null`, [deps.clock.now()]),
  );
  return c.json({ ok: true });
});

/** Every pending tag of me across all nights ("Theo tagged you in 3 photos"). */
me.get("/tags", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const rows = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (
        await tx.query<{ shot_id: string; tagger_id: string; night_id: string; tagger_name: string | null }>(
          `select t.shot_id, t.tagger_id, s.night_id, p.display_name as tagger_name
       from shot_tags t join shots s on s.id = t.shot_id left join profiles p on p.id = t.tagger_id
       where t.subject_id = $1 and t.status = 'pending' order by t.created_at desc`,
          [userId],
        )
      ).rows,
  );
  return c.json({
    tags: rows.map((r) => ({
      shotId: r.shot_id,
      taggerId: r.tagger_id,
      taggerName: r.tagger_name,
      nightId: r.night_id,
    })),
  });
});

me.get("/deferred", async (c) => {
  const deps = c.get("deps");
  const rows = await asUser(
    deps.db,
    c.get("userId"),
    async (tx) =>
      (
        await tx.query<{
          id: string;
          action: string;
          payload: Record<string, unknown>;
          ask_at: Date;
          created_at: Date;
        }>(
          `select id, action, payload, ask_at, created_at from deferred_actions where resolved_at is null order by created_at`,
        )
      ).rows,
  );
  const now = deps.clock.now();
  return c.json({
    deferred: rows.map((r) => ({
      id: r.id,
      action: r.action,
      payload: r.payload,
      askAt: r.ask_at.toISOString(),
      due: r.ask_at <= now,
    })),
  });
});

me.post("/deferred/:id", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const { confirm } = await body(c, z.object({ confirm: z.boolean() }));
  const row = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (
        await tx.query<{ id: string; action: string; payload: Record<string, string>; ask_at: Date }>(
          `select id, action, payload, ask_at from deferred_actions where id = $1 and resolved_at is null`,
          [id],
        )
      ).rows[0],
  );
  if (!row) fail(404, "not_found");
  const me = await loadMe(deps, userId);
  if (confirm && (await nightModeFor(deps, me!)) && shouldDefer(row!.action as never, true)) {
    fail(425, "too_early", "Still night time. We'll ask you again in the morning.", {
      askAt: deferUntil(deps.clock.now(), me!.tz).toISOString(),
    });
  }
  if (confirm) await executeDeferred(deps, userId, row!.action, row!.payload);
  await asService(deps.db, (tx) =>
    tx.query(`update deferred_actions set resolved_at = $2, resolution = $3 where id = $1`, [
      id,
      deps.clock.now(),
      confirm ? "confirmed" : "cancelled",
    ]),
  );
  return c.json({ ok: true, resolution: confirm ? "confirmed" : "cancelled" });
});

me.delete("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const me = await loadMe(deps, userId);
  if (await nightModeFor(deps, me!)) {
    const askAt = deferUntil(deps.clock.now(), me!.tz);
    await asService(deps.db, (tx) =>
      tx.query(
        `insert into deferred_actions (user_id, action, payload, created_at, ask_at) values ($1, 'delete_account', '{}', $2, $3)`,
        [userId, deps.clock.now(), askAt],
      ),
    );
    return c.json({ deferred: true, askAt: askAt.toISOString() }, 202);
  }
  await executeDeferred(deps, userId, "delete_account", {});
  return c.json({ ok: true, deleted: true });
});
