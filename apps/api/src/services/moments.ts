// Weekly Nightcap moments + nudges for long-distance crews (OLD_FRIENDS.md). The moment is a night
// with kind = 'moment' and a roll of 1: same album engine, same RLS, reveal when everyone's in.
import {
  computeNudges,
  currentOrNextMoment,
  momentSchedule,
  nudgeCopy,
  pastMoments,
  type MomentSchedule,
} from "@nightcap/core";
import { asService } from "@nightcap/db";
import type { Deps } from "../deps";

interface CrewMomentRow {
  id: string;
  name: string;
  tz: string;
  kind: string;
  moment_weekday: number;
  moment_hour: number;
  moment_minute: number;
  moment_duration_min: number;
}

const scheduleOf = (c: CrewMomentRow): MomentSchedule => ({
  weekday: c.moment_weekday,
  hour: c.moment_hour,
  minute: c.moment_minute,
  durationMinutes: c.moment_duration_min,
});

/** Ensures the open window has its moment night (idempotent). Returns the window and the night id. */
export async function ensureMoment(deps: Deps, crewId: string) {
  const now = deps.clock.now();
  return asService(deps.db, async (tx) => {
    const c = (
      await tx.query<CrewMomentRow>(
        `select id, name, tz, kind, moment_weekday, moment_hour, moment_minute, moment_duration_min from crews where id = $1`,
        [crewId],
      )
    ).rows[0];
    if (!c) return null;
    const w = currentOrNextMoment(now, c.tz, scheduleOf(c));
    let nightId: string | null = null;
    if (w.isOpen) {
      const existing = (
        await tx.query<{ id: string }>(
          `select id from nights where crew_id = $1 and kind = 'moment' and started_at = $2`,
          [crewId, w.opensAt],
        )
      ).rows[0];
      if (existing) nightId = existing.id;
      else {
        const s = momentSchedule(w.opensAt, w.closesAt);
        nightId = (
          await tx.query<{ id: string }>(
            `insert into nights (crew_id, kind, title, tz, started_by, started_at, auto_end_at, unlock_at, earliest_unlock_at, roll_size)
             values ($1, 'moment', 'Nightcap', $2, null, $3, $4, $5, $6, 1) returning id`,
            [crewId, c.tz, w.opensAt, s.autoEndAt, s.unlockAt, s.earliestUnlockAt],
          )
        ).rows[0]!.id;
        await tx.query(
          `insert into night_members (night_id, user_id, via, joined_at) select $1, user_id, 'moment', $2 from crew_members where crew_id = $3`,
          [nightId, w.opensAt, crewId],
        );
        await tx.query(
          `insert into notifications (user_id, kind, payload, created_at) select user_id, 'moment_open', $2, $3 from crew_members where crew_id = $1`,
          [crewId, JSON.stringify({ night_id: nightId, crew_id: crewId, crew: c.name }), now],
        );
      }
    }
    const last = (
      await tx.query<{ id: string }>(
        `select id from nights where crew_id = $1 and kind = 'moment' and unlocked_at is not null order by started_at desc limit 1`,
        [crewId],
      )
    ).rows[0];
    return { window: w, openNightId: nightId, lastNightId: last?.id ?? null, crew: c };
  });
}

/** Compute and deliver nudges for one long-distance crew (as in-app notifications). */
export async function runNudges(deps: Deps, crewId: string): Promise<number> {
  const now = deps.clock.now();
  return asService(deps.db, async (tx) => {
    const c = (
      await tx.query<CrewMomentRow>(
        `select id, name, tz, kind, moment_weekday, moment_hour, moment_minute, moment_duration_min from crews where id = $1`,
        [crewId],
      )
    ).rows[0];
    if (!c || c.kind !== "long_distance") return 0;
    const members = (
      await tx.query<{ user_id: string; joined_at: Date; muted_until: Date | null; display_name: string }>(
        `select m.user_id, m.joined_at, m.muted_until, p.display_name from crew_members m join profiles p on p.id = m.user_id where m.crew_id = $1`,
        [crewId],
      )
    ).rows;
    const windows = pastMoments(now, c.tz, 3, scheduleOf(c));
    const posted = async (opensAt: Date) =>
      (
        await tx.query<{ author_id: string }>(
          `select distinct s.author_id from shots s join nights n on n.id = s.night_id where n.crew_id = $1 and n.kind = 'moment' and n.started_at = $2 and s.status in ('held','kept')`,
          [crewId, opensAt],
        )
      ).rows.map((r) => r.author_id);
    const closed = [];
    for (const w of windows)
      closed.push({ opensAt: w.opensAt, closesAt: w.closesAt, postedUserIds: await posted(w.opensAt) });
    const cur = currentOrNextMoment(now, c.tz, scheduleOf(c));
    const open = cur.isOpen ? { closesAt: cur.closesAt, postedUserIds: await posted(cur.opensAt) } : null;
    const sent = (
      await tx.query<{
        to_user_id: string;
        about_user_id: string | null;
        kind: "quiet_friend" | "moment_closing";
        sent_at: Date;
      }>(
        `select to_user_id, about_user_id, kind, sent_at from nudges_sent where crew_id = $1 and sent_at > $2`,
        [crewId, new Date(now.getTime() - 30 * 86_400_000)],
      )
    ).rows.map((r) => ({
      toUserId: r.to_user_id,
      aboutUserId: r.about_user_id,
      kind: r.kind,
      sentAt: r.sent_at,
    }));
    const blockedPairs = new Set(
      (
        await tx.query<{ a: string; b: string }>(
          `select b.blocker_id as a, b.blocked_id as b from blocks b
           join crew_members x on x.user_id = b.blocker_id and x.crew_id = $1
           join crew_members y on y.user_id = b.blocked_id and y.crew_id = $1`,
          [crewId],
        )
      ).rows.map((r) => (r.a < r.b ? `${r.a}|${r.b}` : `${r.b}|${r.a}`)),
    );
    const nudges = computeNudges({
      blockedPairs,
      members: members.map((m) => ({ userId: m.user_id, joinedAt: m.joined_at, mutedUntil: m.muted_until })),
      closedMoments: closed,
      openMoment: open,
      sent,
      now,
    });
    const names = Object.fromEntries(members.map((m) => [m.user_id, m.display_name]));
    for (const n of nudges) {
      await tx.query(
        `insert into nudges_sent (crew_id, to_user_id, about_user_id, kind, sent_at) values ($1, $2, $3, $4, $5)`,
        [crewId, n.toUserId, n.aboutUserId, n.kind, now],
      );
      await tx.query(
        `insert into notifications (user_id, kind, payload, created_at) values ($1, 'nudge', $2, $3)`,
        [
          n.toUserId,
          JSON.stringify({
            crew_id: crewId,
            crew: c.name,
            about: n.aboutUserId,
            kind: n.kind,
            text: nudgeCopy(n, names),
          }),
          now,
        ],
      );
    }
    return nudges.length;
  });
}
