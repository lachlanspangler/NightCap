// Night lifecycle (ADR 0003). Pure: every function takes `now` explicitly.
import { HOUR, maxDate, minDate, nextLocalTime } from "./time";

export type NightKind = "night" | "moment" | "city";
export type NightPhase = "live" | "developing" | "unlocked";

export const NIGHT_RULES = {
  /** Live nights auto-end at this local hour… */
  autoEndHour: 5,
  /** …or this many hours after the start, whichever is first. */
  autoEndMaxHours: 12,
  /** A night is live for at least this long before the auto-end can hit (a 4:30am start doesn't end at 5). */
  minLiveHours: 1,
  /** Albums unlock at this local hour the morning after… */
  unlockHour: 10,
  /** …and never sooner than this many hours after the start. */
  minHoursBeforeUnlock: 6,
  /** Early reveal ("everyone's up") counts only from this local hour: the sober check. */
  earliestUnlockHour: 7,
  /** Exposures per person per night. */
  rollSize: 24,
  /** Exposures per person in a weekly moment. */
  momentRollSize: 1,
} as const;

export type NightRules = typeof NIGHT_RULES;

export interface NightSchedule {
  autoEndAt: Date;
  unlockAt: Date;
  earliestUnlockAt: Date;
}

/** Fixed timestamps for a night started at `startedAt` in `tz`. */
export function computeNightSchedule(
  startedAt: Date,
  tz: string,
  rules: NightRules = NIGHT_RULES,
): NightSchedule {
  const cap = new Date(startedAt.getTime() + rules.autoEndMaxHours * HOUR);
  const minEnd = new Date(startedAt.getTime() + rules.minLiveHours * HOUR);
  const autoEndAt = minDate(nextLocalTime(minEnd, tz, rules.autoEndHour), cap);
  const unlockFloor = maxDate(autoEndAt, new Date(startedAt.getTime() + rules.minHoursBeforeUnlock * HOUR));
  const unlockAt = nextLocalTime(unlockFloor, tz, rules.unlockHour);
  const earliestUnlockAt = minDate(nextLocalTime(autoEndAt, tz, rules.earliestUnlockHour), unlockAt);
  return { autoEndAt, unlockAt, earliestUnlockAt };
}

/** Earliest-unlock moves earlier if the night was ended by hand (but never before its own 07:00). */
export function effectiveEarliestUnlock(
  schedule: NightSchedule,
  endedAt: Date | null,
  tz: string,
  rules: NightRules = NIGHT_RULES,
): Date {
  if (!endedAt || endedAt >= schedule.autoEndAt) return schedule.earliestUnlockAt;
  return minDate(nextLocalTime(endedAt, tz, rules.earliestUnlockHour), schedule.unlockAt);
}

export interface NightState {
  kind: NightKind;
  tz: string;
  startedAt: Date;
  endedAt: Date | null;
  unlockedAt: Date | null;
  autoEndAt: Date;
  unlockAt: Date;
  earliestUnlockAt: Date;
}

export interface ParticipantState {
  userId: string;
  readyAt: Date | null;
  shotCount: number;
}

export function phaseOf(night: Pick<NightState, "endedAt" | "unlockedAt">): NightPhase {
  if (night.unlockedAt) return "unlocked";
  if (night.endedAt) return "developing";
  return "live";
}

export type UnlockReason = "scheduled" | "everyone_ready" | "everyone_posted" | "window_closed";

export interface NightAdvance {
  phase: NightPhase;
  /** Set when this call ends the night (auto-end). */
  endedAt?: Date;
  /** Set when this call unlocks the night. */
  unlockedAt?: Date;
  reason?: UnlockReason;
  changed: boolean;
}

/** Whether every participant's "I'm good" counts for an early reveal at `now`. */
export function everyoneReady(night: NightState, participants: ParticipantState[], now: Date): boolean {
  const floor = effectiveEarliestUnlock(night, night.endedAt, night.tz);
  if (now < floor || participants.length === 0) return false;
  return participants.every((p) => p.readyAt !== null && p.readyAt >= floor);
}

/**
 * The state transition for a night at `now`. Idempotent: applying its patch and calling it again
 * returns `changed: false`. The API persists `endedAt` / `unlockedAt` from the result.
 */
export function advanceNight(night: NightState, participants: ParticipantState[], now: Date): NightAdvance {
  if (night.unlockedAt) return { phase: "unlocked", changed: false };

  if (night.kind === "moment") {
    // Moments: live window [startedAt, autoEndAt). Reveal when everyone has posted, or at close.
    const allPosted = participants.length > 0 && participants.every((p) => p.shotCount > 0);
    if (allPosted) {
      return {
        phase: "unlocked",
        endedAt: night.endedAt ?? now,
        unlockedAt: now,
        reason: "everyone_posted",
        changed: true,
      };
    }
    if (now >= night.autoEndAt) {
      return {
        phase: "unlocked",
        endedAt: night.endedAt ?? night.autoEndAt,
        unlockedAt: night.autoEndAt,
        reason: "window_closed",
        changed: true,
      };
    }
    return { phase: "live", changed: false };
  }

  let endedAt = night.endedAt;
  let changed = false;
  const patch: NightAdvance = { phase: "live", changed: false };
  if (!endedAt && now >= night.autoEndAt) {
    endedAt = night.autoEndAt;
    patch.endedAt = endedAt;
    changed = true;
  }
  if (!endedAt) return patch;

  const ended: NightState = { ...night, endedAt };
  if (now >= night.unlockAt) {
    return { ...patch, phase: "unlocked", unlockedAt: night.unlockAt, reason: "scheduled", changed: true };
  }
  if (everyoneReady(ended, participants, now)) {
    return { ...patch, phase: "unlocked", unlockedAt: now, reason: "everyone_ready", changed: true };
  }
  return { ...patch, phase: "developing", changed };
}

export type ReadyError = "not_developing" | "too_early";

/** Can a participant's "I'm good" be recorded now? Before 07:00 it doesn't count, so we say so. */
export function canMarkReady(
  night: NightState,
  now: Date,
): { ok: true } | { ok: false; error: ReadyError; countsFrom?: Date } {
  if (phaseOf(night) !== "developing") return { ok: false, error: "not_developing" };
  const floor = effectiveEarliestUnlock(night, night.endedAt, night.tz);
  if (now < floor) return { ok: false, error: "too_early", countsFrom: floor };
  return { ok: true };
}

/** Moment window (`kind = moment`): times are the window itself, there's no developing phase. */
export function momentSchedule(opensAt: Date, closesAt: Date): NightSchedule {
  return { autoEndAt: closesAt, unlockAt: closesAt, earliestUnlockAt: closesAt };
}

export function rollSizeFor(kind: NightKind, rules: NightRules = NIGHT_RULES): number {
  return kind === "moment" ? rules.momentRollSize : rules.rollSize;
}
