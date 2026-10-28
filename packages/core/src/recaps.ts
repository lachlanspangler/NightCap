// Recaps for crews (OLD_FRIENDS.md): "On this night" and "Month in review".
// Inputs are already visibility-filtered for the viewer (only albums they were in, only shots they can see).
import { HOUR, localParts } from "./time";

export interface RecapNight {
  id: string;
  title: string | null;
  startedAt: Date;
  tz: string;
  unlocked: boolean;
  city: string | null;
}

export interface RecapShot {
  id: string;
  nightId: string;
  authorId: string;
  takenAt: Date;
  reactions: number;
}

/** The calendar date a night "belongs to": a 1am shot is still Saturday night. */
export function nightDate(startedAt: Date, tz: string) {
  return localParts(new Date(startedAt.getTime() - 6 * HOUR), tz);
}

export interface OnThisNight {
  night: RecapNight;
  yearsAgo: number;
}

/** Nights from previous years on the same month/day as tonight (viewer's tz), newest first. */
export function onThisNight(nights: readonly RecapNight[], now: Date, tz: string): OnThisNight[] {
  const today = nightDate(now, tz);
  return nights
    .filter((n) => n.unlocked)
    .map((n) => ({ n, d: nightDate(n.startedAt, n.tz) }))
    .filter(({ d }) => d.month === today.month && d.day === today.day && d.year < today.year)
    .map(({ n, d }) => ({ night: n, yearsAgo: today.year - d.year }))
    .sort((a, b) => a.yearsAgo - b.yearsAgo);
}

export interface MonthReview {
  year: number;
  month: number;
  nights: number;
  photos: number;
  people: number;
  cities: string[];
  topShotId: string | null;
  busiestNightId: string | null;
}

export function monthInReview(
  nights: readonly RecapNight[],
  shots: readonly RecapShot[],
  year: number,
  month: number,
  tz: string,
): MonthReview {
  const inMonth = nights.filter((n) => {
    if (!n.unlocked) return false;
    const d = nightDate(n.startedAt, tz);
    return d.year === year && d.month === month;
  });
  const ids = new Set(inMonth.map((n) => n.id));
  const monthShots = shots.filter((s) => ids.has(s.nightId));
  const perNight = new Map<string, number>();
  for (const s of monthShots) perNight.set(s.nightId, (perNight.get(s.nightId) ?? 0) + 1);
  const top = [...monthShots].sort(
    (a, b) => b.reactions - a.reactions || a.takenAt.getTime() - b.takenAt.getTime(),
  )[0];
  const busiest = [...perNight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    year,
    month,
    nights: inMonth.length,
    photos: monthShots.length,
    people: new Set(monthShots.map((s) => s.authorId)).size,
    cities: [...new Set(inMonth.map((n) => n.city).filter((c): c is string => !!c))].sort(),
    topShotId: top?.id ?? null,
    busiestNightId: busiest?.[0] ?? null,
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function describeMonth(r: MonthReview, crewName: string): string {
  const parts = [
    `${r.nights} night${r.nights === 1 ? "" : "s"}`,
    `${r.photos} photo${r.photos === 1 ? "" : "s"}`,
  ];
  if (r.cities.length > 1) parts.push(`${r.cities.length} cities`);
  return `${MONTHS[r.month - 1]} with ${crewName}: ${parts.join(", ")}`;
}
