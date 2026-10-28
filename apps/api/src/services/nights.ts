// Night state transitions + the night/album view. Time logic is core's (ADR 0003); the DB only
// stores the result. Reads for users go through asUser (RLS).
import {
  advanceNight,
  canMarkReady,
  formatLocalTime,
  phaseOf,
  shotsLeft,
  type NightAdvance,
  type NightKind,
  type NightPhase,
  type NightState,
  type ParticipantState,
} from "@nightcap/core";
import { asService, asUser, type Queryable } from "@nightcap/db";
import type { Deps } from "../deps";
import { signMediaPath } from "../media/sign";

export interface NightRow {
  id: string;
  crew_id: string | null;
  kind: NightKind;
  title: string | null;
  venue_label: string | null;
  city: string | null;
  tz: string;
  started_by: string | null;
  started_at: Date;
  auto_end_at: Date;
  unlock_at: Date;
  earliest_unlock_at: Date;
  ended_at: Date | null;
  unlocked_at: Date | null;
  unlock_reason: string | null;
  join_code: string | null;
  roll_size: number;
  is_demo: boolean;
}

export const toState = (n: NightRow): NightState => ({
  kind: n.kind,
  tz: n.tz,
  startedAt: n.started_at,
  endedAt: n.ended_at,
  unlockedAt: n.unlocked_at,
  autoEndAt: n.auto_end_at,
  unlockAt: n.unlock_at,
  earliestUnlockAt: n.earliest_unlock_at,
});

async function loadForAdvance(tx: Queryable, nightId: string) {
  const n = (await tx.query<NightRow>(`select * from nights where id = $1`, [nightId])).rows[0];
  if (!n) return null;
  const members = (
    await tx.query<{ user_id: string; ready_at: Date | null; shots: number }>(
      `select m.user_id, m.ready_at,
              (select count(*)::int from shots s where s.night_id = m.night_id and s.author_id = m.user_id and s.status in ('held','kept')) as shots
       from night_members m where m.night_id = $1`,
      [nightId],
    )
  ).rows;
  const participants: ParticipantState[] = members.map((m) => ({
    userId: m.user_id,
    readyAt: m.ready_at,
    shotCount: m.shots,
  }));
  return { night: n, participants };
}

/** Advance one night to `now` (idempotent). Deletes discarded media at the unlock. */
export async function advance(deps: Deps, nightId: string): Promise<NightAdvance | null> {
  const now = deps.clock.now();
  const result = await asService(deps.db, async (tx) => {
    const loaded = await loadForAdvance(tx, nightId);
    if (!loaded) return null;
    const r = advanceNight(toState(loaded.night), loaded.participants, now);
    if (!r.changed) return { r, discarded: [] as string[] };
    await tx.query(`select apply_night_advance($1, $2, $3, $4)`, [
      nightId,
      r.endedAt ?? null,
      r.unlockedAt ?? null,
      r.reason ?? null,
    ]);
    const discarded = r.unlockedAt
      ? (
          await tx.query<{ media_key: string }>(
            `select media_key from shots where night_id = $1 and status = 'discarded'`,
            [nightId],
          )
        ).rows.map((x) => x.media_key)
      : [];
    return { r, discarded };
  });
  if (!result) return null;
  for (const key of result.discarded) await deps.media.delete(key).catch(() => undefined);
  if (result.r.changed)
    deps.log?.(
      `night ${nightId.slice(0, 8)} → ${result.r.phase}${result.r.reason ? ` (${result.r.reason})` : ""}`,
    );
  return result.r;
}

/** Ticker: advance every night that could change now. */
export async function advanceDue(deps: Deps): Promise<number> {
  const now = deps.clock.now();
  const ids = await asService(deps.db, async (tx) =>
    (
      await tx.query<{ id: string }>(
        `select id from nights where unlocked_at is null and (ended_at is not null or auto_end_at <= $1 or kind = 'moment')`,
        [now],
      )
    ).rows.map((r) => r.id),
  );
  let changed = 0;
  for (const id of ids) if ((await advance(deps, id))?.changed) changed++;
  return changed;
}

export interface ShotDto {
  id: string;
  authorId: string;
  takenAt: string;
  url: string;
  width: number | null;
  height: number | null;
  mine: boolean;
  status: string;
  hiddenFromOthers: boolean;
  reactions: Record<string, number>;
  myReaction: string | null;
  tags: { userId: string; status: string }[];
}

export interface NightDto {
  id: string;
  kind: NightKind;
  crew: { id: string; name: string; emoji: string } | null;
  title: string | null;
  venue: string | null;
  tz: string;
  phase: NightPhase;
  startedAt: string;
  startedBy: string | null;
  autoEndAt: string;
  unlockAt: string;
  earliestUnlockAt: string;
  endedAt: string | null;
  unlockedAt: string | null;
  unlockReason: string | null;
  unlockAtLabel: string;
  earliestUnlockLabel: string;
  code: string | null;
  rollSize: number;
  me: {
    isParticipant: boolean;
    ready: boolean;
    canEnd: boolean;
    shotsTaken: number;
    shotsLeft: number;
    canMarkReady: boolean;
    readyCountsFrom: string | null;
  };
  participants: { id: string; name: string; hue: number; ready: boolean; shots: number; via: string }[];
  total: number;
  shots: ShotDto[];
  pendingTagsForMe: { shotId: string; taggerId: string }[];
  isDemo: boolean;
}

/** The whole night as the viewer may see it. Returns null if RLS hides it. */
export async function nightView(deps: Deps, viewerId: string, nightId: string): Promise<NightDto | null> {
  await advance(deps, nightId);
  const now = deps.clock.now();
  const nowSec = Math.floor(now.getTime() / 1000);
  return asUser(deps.db, viewerId, async (tx) => {
    const n = (await tx.query<NightRow>(`select * from nights where id = $1`, [nightId])).rows[0];
    if (!n) return null;
    const phase = phaseOf({ endedAt: n.ended_at, unlockedAt: n.unlocked_at });
    const crew = n.crew_id
      ? ((
          await tx.query<{ id: string; name: string; emoji: string }>(
            `select id, name, emoji from crews where id = $1`,
            [n.crew_id],
          )
        ).rows[0] ?? null)
      : null;
    const people = (
      await tx.query<{
        user_id: string;
        display_name: string;
        avatar_hue: number;
        ready: boolean;
        via: string;
      }>(`select user_id, display_name, avatar_hue, ready, via from night_participants($1)`, [nightId])
    ).rows;
    const counts = new Map(
      (
        await tx.query<{ user_id: string; shots: number }>(`select user_id, shots from night_counts($1)`, [
          nightId,
        ])
      ).rows.map((r) => [r.user_id, r.shots]),
    );
    const isParticipant = people.some((p) => p.user_id === viewerId);
    const shots = (
      await tx.query<{
        id: string;
        author_id: string;
        taken_at: Date;
        status: string;
        width: number | null;
        height: number | null;
        hidden: boolean;
      }>(
        `select id, author_id, taken_at, status, width, height, shot_hidden_from_others(id) as hidden
         from shots where night_id = $1 and status <> 'deleted' order by taken_at, id`,
        [nightId],
      )
    ).rows;
    const ids = shots.map((s) => s.id);
    const reactions = ids.length
      ? (
          await tx.query<{ shot_id: string; user_id: string; emoji: string }>(
            `select shot_id, user_id, emoji from reactions where shot_id = any($1)`,
            [ids],
          )
        ).rows
      : [];
    const tags = ids.length
      ? (
          await tx.query<{ shot_id: string; subject_id: string; tagger_id: string; status: string }>(
            `select shot_id, subject_id, tagger_id, status from shot_tags where shot_id = any($1)`,
            [ids],
          )
        ).rows
      : [];
    const myTaken = (
      await tx.query<{ n: number }>(
        `select count(*)::int as n from shots where night_id = $1 and author_id = $2`,
        [nightId, viewerId],
      )
    ).rows[0]!.n;
    const me = people.find((p) => p.user_id === viewerId);
    const role = n.crew_id
      ? ((await tx.query<{ r: string | null }>(`select crew_role($1) as r`, [n.crew_id])).rows[0]?.r ?? null)
      : null;
    const ready = canMarkReady(toState(n), now);

    const dto: NightDto = {
      id: n.id,
      kind: n.kind,
      crew,
      title: n.title,
      venue: n.venue_label,
      tz: n.tz,
      phase,
      startedAt: n.started_at.toISOString(),
      startedBy: n.started_by,
      autoEndAt: n.auto_end_at.toISOString(),
      unlockAt: n.unlock_at.toISOString(),
      earliestUnlockAt: n.earliest_unlock_at.toISOString(),
      endedAt: n.ended_at?.toISOString() ?? null,
      unlockedAt: n.unlocked_at?.toISOString() ?? null,
      unlockReason: n.unlock_reason,
      unlockAtLabel: formatLocalTime(n.unlock_at, n.tz),
      earliestUnlockLabel: formatLocalTime(n.earliest_unlock_at, n.tz),
      code: isParticipant && phase === "live" ? n.join_code : null,
      rollSize: n.roll_size,
      me: {
        isParticipant,
        ready: me?.ready ?? false,
        canEnd: phase === "live" && (n.started_by === viewerId || role === "owner"),
        shotsTaken: myTaken,
        shotsLeft: shotsLeft(n.roll_size, myTaken),
        canMarkReady: isParticipant && ready.ok,
        readyCountsFrom:
          !ready.ok && ready.error === "too_early" ? (ready.countsFrom?.toISOString() ?? null) : null,
      },
      participants: people.map((p) => ({
        id: p.user_id,
        name: p.display_name,
        hue: p.avatar_hue,
        ready: p.ready,
        shots: counts.get(p.user_id) ?? 0,
        via: p.via,
      })),
      total: [...counts.values()].reduce((a, b) => a + b, 0),
      shots: shots.map((s) => {
        const rs = reactions.filter((r) => r.shot_id === s.id);
        const summary: Record<string, number> = {};
        for (const r of rs) summary[r.emoji] = (summary[r.emoji] ?? 0) + 1;
        return {
          id: s.id,
          authorId: s.author_id,
          takenAt: s.taken_at.toISOString(),
          url: signMediaPath(deps.config.mediaSecret, s.id, viewerId, nowSec),
          width: s.width,
          height: s.height,
          mine: s.author_id === viewerId,
          status: s.status,
          hiddenFromOthers: s.hidden,
          reactions: summary,
          myReaction: rs.find((r) => r.user_id === viewerId)?.emoji ?? null,
          tags: tags
            .filter((t) => t.shot_id === s.id && t.status !== "removed")
            .map((t) => ({ userId: t.subject_id, status: t.status })),
        };
      }),
      pendingTagsForMe: tags
        .filter((t) => t.subject_id === viewerId && t.status === "pending")
        .map((t) => ({ shotId: t.shot_id, taggerId: t.tagger_id })),
      isDemo: n.is_demo,
    };
    return dto;
  });
}
