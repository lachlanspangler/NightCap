// 21+ gate (PRIVACY_SAFETY). DOB is private; only the boolean leaves the server.
import { localParts } from "./time";
import { err, ok, type Result } from "./result";

export const MIN_AGE = 21;
const MAX_AGE = 120;

export interface Ymd {
  year: number;
  month: number;
  day: number;
}

export function parseBirthdate(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Whole years old on the local date of `now` in `tz`. A Feb 29 birthday ticks over on Mar 1. */
export function ageOn(birth: Ymd, now: Date, tz: string): number {
  const t = localParts(now, tz);
  let age = t.year - birth.year;
  const hadBirthday = t.month > birth.month || (t.month === birth.month && t.day >= birth.day);
  if (!hadBirthday) age -= 1;
  return age;
}

export type AgeError = "invalid_date" | "under_21" | "implausible";

export function checkAge(birthdate: string, now: Date, tz: string): Result<number, AgeError> {
  const b = parseBirthdate(birthdate);
  if (!b) return err("invalid_date");
  const age = ageOn(b, now, tz);
  if (age < 0 || age > MAX_AGE) return err("implausible");
  if (age < MIN_AGE) return err("under_21");
  return ok(age);
}
