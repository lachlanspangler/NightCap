// Test + seed helpers. Setup writes go through service_role; assertions go through asUser (RLS).
import { randomUUID } from "node:crypto";
import { computeNightSchedule, type NightPhase } from "@nightcap/core";
import { asService, type Db, type Queryable } from "./index";

export async function makeUser(
  db: Db | Queryable,
  name: string,
  opts: { id?: string; birthdate?: string; tz?: string; isDemo?: boolean; hue?: number; city?: string } = {},
): Promise<string> {
  const id = opts.id ?? randomUUID();
  const run = async (tx: Queryable) => {
    await tx.query(`insert into auth.users (id) values ($1)`, [id]);
    await tx.query(
      `insert into public.profiles (id, display_name, birthdate, is_21_attested, tz, is_demo, avatar_hue, city)
       values ($1, $2, $3, true, $4, $5, $6, $7)`,
      [
        id,
        name,
        opts.birthdate ?? "1999-04-12",
        opts.tz ?? "America/Chicago",
        opts.isDemo ?? false,
        opts.hue ?? 280,
        opts.city ?? null,
      ],
    );
  };
  if ("transaction" in db) await asService(db, run);
  else await run(db);
  return id;
}

export async function makeCrew(
  db: Db,
  ownerId: string,
  memberIds: string[],
  name = "Night Owls",
  kind = "local",
): Promise<string> {
  return asService(db, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.crews (name, kind, created_by) values ($1, $2, $3) returning id`,
      [name, kind, ownerId],
    );
    const id = rows[0]!.id;
    await tx.query(`insert into public.crew_members (crew_id, user_id, role) values ($1, $2, 'owner')`, [
      id,
      ownerId,
    ]);
    for (const m of memberIds) {
      if (m !== ownerId)
        await tx.query(`insert into public.crew_members (crew_id, user_id) values ($1, $2)`, [id, m]);
    }
    return id;
  });
}

/** Insert a night directly in a given phase (service role), with core-computed schedule. */
export async function makeNight(
  db: Db,
  opts: {
    crewId: string;
    startedBy: string;
    participants: string[];
    phase?: NightPhase;
    startedAt?: Date;
    tz?: string;
    code?: string | null;
    kind?: "night" | "moment" | "city";
    rollSize?: number;
  },
): Promise<string> {
  const tz = opts.tz ?? "America/Chicago";
  const startedAt = opts.startedAt ?? new Date("2026-10-31T02:00:00Z");
  const s = computeNightSchedule(startedAt, tz);
  const phase = opts.phase ?? "live";
  const endedAt = phase === "live" ? null : s.autoEndAt;
  const unlockedAt = phase === "unlocked" ? s.unlockAt : null;
  return asService(db, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.nights (crew_id, kind, tz, started_by, started_at, auto_end_at, unlock_at, earliest_unlock_at, ended_at, unlocked_at, join_code, roll_size)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [
        opts.crewId,
        opts.kind ?? "night",
        tz,
        opts.startedBy,
        startedAt,
        s.autoEndAt,
        s.unlockAt,
        s.earliestUnlockAt,
        endedAt,
        unlockedAt,
        opts.code ?? null,
        opts.rollSize ?? 24,
      ],
    );
    const id = rows[0]!.id;
    for (const u of opts.participants) {
      await tx.query(
        `insert into public.night_members (night_id, user_id, via, joined_at) values ($1, $2, $3, $4)`,
        [id, u, u === opts.startedBy ? "starter" : "crew", startedAt],
      );
    }
    return id;
  });
}

export async function makeShot(
  db: Db,
  nightId: string,
  authorId: string,
  opts: {
    status?: "held" | "kept" | "discarded" | "deleted";
    takenAt?: Date;
    mediaKey?: string;
    isDemo?: boolean;
  } = {},
): Promise<string> {
  return asService(db, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into public.shots (night_id, author_id, media_key, taken_at, status, is_demo, width, height)
       values ($1, $2, $3, $4, $5, $6, 1200, 1600) returning id`,
      [
        nightId,
        authorId,
        opts.mediaKey ?? `test/${randomUUID()}.jpg`,
        opts.takenAt ?? new Date("2026-10-31T03:00:00Z"),
        opts.status ?? "held",
        opts.isDemo ?? false,
      ],
    );
    return rows[0]!.id;
  });
}

export async function service(db: Db, sql: string, params: unknown[] = []) {
  return asService(db, (tx) => tx.query(sql, params));
}
