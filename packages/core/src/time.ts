// Time-zone-aware local-time math with no dependencies (Intl only).
//
// Everything in NightCap that says "10:00 the morning after" means 10:00 *in the night's IANA
// time zone*, across DST changes. We never do arithmetic on local wall-clock values directly:
// we convert wall-clock → instant with a two-pass offset correction, which is exact for every
// instant except wall times that don't exist (spring-forward gap → shifted forward by the gap)
// or exist twice (fall-back → the earlier instant).

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday … 6 = Saturday
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of `instant` in `tz`. */
export function localParts(instant: Date, tz: string): LocalParts {
  const parts = formatter(tz).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** Offset of `tz` from UTC at `instant`, in minutes (e.g. -300 for CDT). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - whole) / MINUTE);
}

export interface WallTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
}

/** The instant at which the wall clock in `tz` reads `wall`. */
export function zonedToInstant(wall: WallTime, tz: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute ?? 0, 0);
  // Pass 1: assume the offset at the naive instant. Pass 2: correct with the offset at the guess.
  const o1 = tzOffsetMinutes(new Date(naive), tz);
  const guess = naive - o1 * MINUTE;
  const o2 = tzOffsetMinutes(new Date(guess), tz);
  if (o1 === o2) return new Date(guess);
  const second = naive - o2 * MINUTE;
  // Check which candidate actually reads as the wall time; for a gap neither does, so take the
  // later one (wall time pushed forward by the gap); for an overlap both do, so take the earlier.
  const reads = (t: number) => {
    const p = localParts(new Date(t), tz);
    return p.hour === wall.hour && (p.minute === (wall.minute ?? 0));
  };
  const a = Math.min(guess, second);
  const b = Math.max(guess, second);
  if (reads(a)) return new Date(a);
  if (reads(b)) return new Date(b);
  return new Date(b);
}

/** Calendar date `days` after the local date of `instant` in `tz` (day arithmetic in UTC is safe). */
export function addLocalDays(parts: Pick<LocalParts, "year" | "month" | "day">, days: number) {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * First instant ≥ `from` at which the local clock in `tz` reads hour:minute.
 * ("Strictly after" when `strict` is true.)
 */
export function nextLocalTime(from: Date, tz: string, hour: number, minute = 0, strict = false): Date {
  const p = localParts(from, tz);
  for (let d = 0; d < 3; d++) {
    const date = addLocalDays(p, d);
    const t = zonedToInstant({ ...date, hour, minute }, tz);
    if (strict ? t.getTime() > from.getTime() : t.getTime() >= from.getTime()) return t;
  }
  // Unreachable for real zones (a day always contains each wall hour or its shifted twin).
  throw new Error(`nextLocalTime: no ${hour}:${minute} found in ${tz} after ${from.toISOString()}`);
}

/** Local calendar date string YYYY-MM-DD of `instant` in `tz`. */
export function localDate(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function maxDate(...ds: Date[]): Date {
  return new Date(Math.max(...ds.map((d) => d.getTime())));
}
export function minDate(...ds: Date[]): Date {
  return new Date(Math.min(...ds.map((d) => d.getTime())));
}

/** "10:00 AM" in `tz`. Used for copy like "Develops at 10:00 AM". */
export function formatLocalTime(instant: Date, tz: string): string {
  const p = localParts(instant, tz);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, "0")} ${p.hour < 12 ? "AM" : "PM"}`;
}

/** "6h 12m", "12m", "now". Countdown copy. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.ceil(ms / MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
