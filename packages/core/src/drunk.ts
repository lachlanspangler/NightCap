// Drunk-proof UX rules (DRUNK_UX.md). The mobile app reads these; screen tests assert them.
import { localParts, nextLocalTime } from "./time";

export type NightModePref = "auto" | "always" | "never";

export const NIGHT_HOURS = { start: 21, end: 6 } as const; // 21:00–05:59 local

export const TARGETS = {
  dayMin: 48,
  nightMin: 56,
  nightPrimary: 88,
  spacing: 16,
} as const;

export const HOLD_TO_CONFIRM_MS = { day: 900, night: 1200 } as const;

export function isNightMode(input: {
  now: Date;
  tz: string;
  inLiveNight: boolean;
  pref?: NightModePref;
}): boolean {
  const pref = input.pref ?? "auto";
  if (pref === "always") return true;
  if (pref === "never") return false;
  if (input.inLiveNight) return true;
  const h = localParts(input.now, input.tz).hour;
  return h >= NIGHT_HOURS.start || h < NIGHT_HOURS.end;
}

export function undoWindowMs(nightMode: boolean): number {
  return nightMode ? 8000 : 5000;
}

export function holdToConfirmMs(nightMode: boolean): number {
  return nightMode ? HOLD_TO_CONFIRM_MS.night : HOLD_TO_CONFIRM_MS.day;
}

export type SensitiveAction =
  | "leave_crew"
  | "delete_account"
  | "remove_member"
  | "delete_crew"
  | "block_user"
  | "report"
  | "hide_shot"
  | "delete_shot";

/**
 * Irreversible-and-social actions wait for the morning. Safety actions never wait: removing a
 * member is often removing the problem at 1am (privacy review C1), so it isn't deferred.
 */
const DEFERRED_AT_NIGHT: ReadonlySet<SensitiveAction> = new Set([
  "leave_crew",
  "delete_account",
  "delete_crew",
]);

export function shouldDefer(action: SensitiveAction, nightMode: boolean): boolean {
  return nightMode && DEFERRED_AT_NIGHT.has(action);
}

/** "We'll ask you again at 10am." */
export function deferUntil(now: Date, tz: string): Date {
  return nextLocalTime(now, tz, 10, 0, true);
}

export const COPY = {
  developing: "Developing…",
  rollFull: "Roll's full. You're in the moment now.",
  deferred: "It's late. We'll ask you again in the morning.",
  tooEarly: "Tap this when you're up for real (after 7:00 AM).",
  everyoneUp: "Everyone's up? Reveal early.",
  futureYou: "Future you will thank you.",
} as const;
