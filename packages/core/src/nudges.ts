// Gentle nudges for long-distance crews (OLD_FRIENDS.md). Rules:
//  - never nudge the quiet person directly ("you haven't posted"); nudge someone active about them, privately
//  - ≤ 1 nudge per recipient per 7 days, ≤ 1 nudge about a person per 14 days
//  - muted members get nothing; no streaks, ever
//  - a reminder 30 min before a moment closes, only if you haven't posted, once
import { DAY, MINUTE } from "./time";

export interface NudgeMember {
  userId: string;
  joinedAt: Date;
  mutedUntil: Date | null;
}

export interface ClosedMoment {
  opensAt: Date;
  closesAt: Date;
  postedUserIds: readonly string[];
}

export interface OpenMoment {
  closesAt: Date;
  postedUserIds: readonly string[];
}

export interface SentNudge {
  toUserId: string;
  aboutUserId: string | null;
  kind: NudgeKind;
  sentAt: Date;
}

export type NudgeKind = "quiet_friend" | "moment_closing";

export interface Nudge {
  toUserId: string;
  aboutUserId: string | null;
  kind: NudgeKind;
}

export const NUDGE_RULES = {
  quietAfterMissed: 3,
  perRecipientMs: 7 * DAY,
  perSubjectMs: 14 * DAY,
  closingSoonMs: 30 * MINUTE,
} as const;

const muted = (m: NudgeMember, now: Date) => m.mutedUntil !== null && m.mutedUntil > now;

export function computeNudges(input: {
  members: readonly NudgeMember[];
  closedMoments: readonly ClosedMoment[]; // newest first
  openMoment: OpenMoment | null;
  sent: readonly SentNudge[];
  now: Date;
}): Nudge[] {
  const { members, closedMoments, openMoment, sent, now } = input;
  const out: Nudge[] = [];
  const recentTo = (uid: string) =>
    sent.some(
      (s) =>
        s.toUserId === uid &&
        s.kind === "quiet_friend" &&
        now.getTime() - s.sentAt.getTime() < NUDGE_RULES.perRecipientMs,
    ) || out.some((n) => n.toUserId === uid && n.kind === "quiet_friend");
  const recentAbout = (uid: string) =>
    sent.some((s) => s.aboutUserId === uid && now.getTime() - s.sentAt.getTime() < NUDGE_RULES.perSubjectMs);

  // Quiet friends: missed the last N moments that happened after they joined.
  const lastN = closedMoments.slice(0, NUDGE_RULES.quietAfterMissed);
  if (lastN.length === NUDGE_RULES.quietAfterMissed) {
    const latest = lastN[0]!;
    const active = members
      .filter((m) => latest.postedUserIds.includes(m.userId) && !muted(m, now))
      .sort((a, b) => a.userId.localeCompare(b.userId));
    const quiet = members
      .filter((m) => lastN.every((w) => m.joinedAt < w.opensAt && !w.postedUserIds.includes(m.userId)))
      .sort((a, b) => a.userId.localeCompare(b.userId));
    for (const q of quiet) {
      if (recentAbout(q.userId)) continue;
      const to = active.find((a) => a.userId !== q.userId && !recentTo(a.userId));
      if (to) out.push({ toUserId: to.userId, aboutUserId: q.userId, kind: "quiet_friend" });
    }
  }

  // Moment closing soon: remind people who haven't posted (once per window).
  if (openMoment) {
    const left = openMoment.closesAt.getTime() - now.getTime();
    if (left > 0 && left <= NUDGE_RULES.closingSoonMs) {
      for (const m of members) {
        if (muted(m, now) || openMoment.postedUserIds.includes(m.userId)) continue;
        const already = sent.some(
          (s) =>
            s.toUserId === m.userId &&
            s.kind === "moment_closing" &&
            openMoment.closesAt.getTime() - s.sentAt.getTime() <= NUDGE_RULES.closingSoonMs &&
            s.sentAt < openMoment.closesAt,
        );
        if (!already) out.push({ toUserId: m.userId, aboutUserId: null, kind: "moment_closing" });
      }
    }
  }
  return out;
}

export function nudgeCopy(n: Nudge, names: Record<string, string>): string {
  if (n.kind === "moment_closing") return "Nightcap closes in 30 minutes. Big night or a quiet one, show us.";
  const who = names[n.aboutUserId ?? ""] ?? "Someone";
  return `${who} hasn't been in a Nightcap for a while. Send them a ping?`;
}
