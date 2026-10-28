// The weekly Nightcap moment for long-distance crews (OLD_FRIENDS.md).
import { DAY, MINUTE, addLocalDays, localParts, zonedToInstant } from "./time";

export interface MomentSchedule {
  weekday: number; // 0 = Sunday … 5 = Friday
  hour: number;
  minute: number;
  durationMinutes: number;
}

export const DEFAULT_MOMENT: MomentSchedule = { weekday: 5, hour: 21, minute: 0, durationMinutes: 120 };

export interface MomentWindow {
  opensAt: Date;
  closesAt: Date;
  isOpen: boolean;
}

function windowFor(date: { year: number; month: number; day: number }, s: MomentSchedule, tz: string) {
  const opensAt = zonedToInstant({ ...date, hour: s.hour, minute: s.minute }, tz);
  return { opensAt, closesAt: new Date(opensAt.getTime() + s.durationMinutes * MINUTE) };
}

/** The window that's open now, or else the next one. In the crew's time zone. */
export function currentOrNextMoment(now: Date, tz: string, s: MomentSchedule = DEFAULT_MOMENT): MomentWindow {
  const today = localParts(now, tz);
  for (let d = -1; d <= 7; d++) {
    const date = addLocalDays(today, d);
    const wd = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    if (wd !== s.weekday) continue;
    const w = windowFor(date, s, tz);
    if (now < w.closesAt) return { ...w, isOpen: now >= w.opensAt };
  }
  throw new Error("unreachable: a weekday recurs within 8 days");
}

/** The most recent `n` windows that have already closed, newest first. */
export function pastMoments(
  now: Date,
  tz: string,
  n: number,
  s: MomentSchedule = DEFAULT_MOMENT,
): MomentWindow[] {
  const out: MomentWindow[] = [];
  const today = localParts(now, tz);
  for (let d = 0; d > -7 * (n + 2) && out.length < n; d--) {
    const date = addLocalDays(today, d);
    const wd = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    if (wd !== s.weekday) continue;
    const w = windowFor(date, s, tz);
    if (w.closesAt <= now) out.push({ ...w, isOpen: false });
  }
  return out;
}

export function validateMomentSchedule(s: MomentSchedule): boolean {
  return (
    Number.isInteger(s.weekday) &&
    s.weekday >= 0 &&
    s.weekday <= 6 &&
    Number.isInteger(s.hour) &&
    s.hour >= 0 &&
    s.hour <= 23 &&
    Number.isInteger(s.minute) &&
    s.minute >= 0 &&
    s.minute <= 59 &&
    Number.isInteger(s.durationMinutes) &&
    s.durationMinutes >= 30 &&
    s.durationMinutes <= DAY / MINUTE
  );
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function describeMoment(s: MomentSchedule): string {
  const h12 = s.hour % 12 === 0 ? 12 : s.hour % 12;
  const ampm = s.hour < 12 ? "am" : "pm";
  const mm = s.minute ? `:${String(s.minute).padStart(2, "0")}` : "";
  const hours = s.durationMinutes % 60 === 0 ? `${s.durationMinutes / 60}h` : `${s.durationMinutes}m`;
  return `${WEEKDAY_NAMES[s.weekday]}s at ${h12}${mm}${ampm} · ${hours} window`;
}
