import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatLocalTime,
  isValidTimeZone,
  localDate,
  localParts,
  nextLocalTime,
  tzOffsetMinutes,
  zonedToInstant,
} from "../src/time";

const at = (iso: string) => new Date(iso);

describe("localParts / offsets", () => {
  it("reads wall-clock parts in a zone", () => {
    const p = localParts(at("2026-10-31T02:30:00Z"), "America/Chicago");
    expect(p).toMatchObject({ year: 2026, month: 10, day: 30, hour: 21, minute: 30, weekday: 5 });
  });
  it("knows CDT, CST, BST, NZDT offsets", () => {
    expect(tzOffsetMinutes(at("2026-07-01T12:00:00Z"), "America/Chicago")).toBe(-300);
    expect(tzOffsetMinutes(at("2026-12-01T12:00:00Z"), "America/Chicago")).toBe(-360);
    expect(tzOffsetMinutes(at("2026-07-01T12:00:00Z"), "Europe/London")).toBe(60);
    expect(tzOffsetMinutes(at("2026-12-31T12:00:00Z"), "Pacific/Auckland")).toBe(780);
    expect(tzOffsetMinutes(at("2026-06-01T12:00:00Z"), "Asia/Kolkata")).toBe(330);
  });
  it("validates zones", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("zonedToInstant", () => {
  it("converts ordinary wall times", () => {
    expect(zonedToInstant({ year: 2026, month: 10, day: 31, hour: 10 }, "America/Chicago").toISOString()).toBe(
      "2026-10-31T15:00:00.000Z",
    );
    expect(zonedToInstant({ year: 2026, month: 1, day: 15, hour: 0, minute: 30 }, "Asia/Kolkata").toISOString()).toBe(
      "2026-01-14T19:00:00.000Z",
    );
  });
  it("pushes a non-existent spring-forward wall time forward by the gap", () => {
    // 2026-03-08 02:30 doesn't exist in Chicago (02:00 → 03:00).
    const t = zonedToInstant({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, "America/Chicago");
    expect(t.toISOString()).toBe("2026-03-08T08:30:00.000Z");
    expect(localParts(t, "America/Chicago").hour).toBe(3);
  });
  it("picks the earlier instant for an ambiguous fall-back wall time", () => {
    // 2026-11-01 01:30 happens twice in Chicago; first is CDT (06:30Z).
    const t = zonedToInstant({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, "America/Chicago");
    expect(t.toISOString()).toBe("2026-11-01T06:30:00.000Z");
  });
});

describe("nextLocalTime", () => {
  it("finds the next 10:00 the morning after", () => {
    expect(nextLocalTime(at("2026-10-31T02:00:00Z"), "America/Chicago", 10).toISOString()).toBe(
      "2026-10-31T15:00:00.000Z",
    );
  });
  it("returns the same instant when already on it (non-strict) and the next day when strict", () => {
    const ten = at("2026-10-31T15:00:00Z");
    expect(nextLocalTime(ten, "America/Chicago", 10).toISOString()).toBe(ten.toISOString());
    expect(nextLocalTime(ten, "America/Chicago", 10, 0, true).toISOString()).toBe("2026-11-01T16:00:00.000Z");
  });
  it("crosses the fall-back night correctly", () => {
    // Sat 31 Oct 21:00 CDT → next 10:00 is Sun 1 Nov 10:00 CST = 16:00Z
    expect(nextLocalTime(at("2026-11-01T02:00:00Z"), "America/Chicago", 10).toISOString()).toBe(
      "2026-11-01T16:00:00.000Z",
    );
  });
  it("crosses the spring-forward night correctly", () => {
    // Sat 7 Mar 21:00 CST (03:00Z) → Sun 8 Mar 10:00 CDT = 15:00Z
    expect(nextLocalTime(at("2026-03-08T03:00:00Z"), "America/Chicago", 10).toISOString()).toBe(
      "2026-03-08T15:00:00.000Z",
    );
  });
  it("works across the date line", () => {
    // NYE in Auckland: 21:00 NZDT on Dec 31 = 08:00Z; next 10:00 = Jan 1 10:00 NZDT = 21:00Z Dec 31
    expect(nextLocalTime(at("2026-12-31T08:00:00Z"), "Pacific/Auckland", 10).toISOString()).toBe(
      "2026-12-31T21:00:00.000Z",
    );
  });
});

describe("formatting", () => {
  it("formats local times for copy", () => {
    expect(formatLocalTime(at("2026-10-31T15:00:00Z"), "America/Chicago")).toBe("10:00 AM");
    expect(formatLocalTime(at("2026-10-31T05:05:00Z"), "America/Chicago")).toBe("12:05 AM");
    expect(formatLocalTime(at("2026-10-31T17:30:00Z"), "America/Chicago")).toBe("12:30 PM");
  });
  it("formats countdowns", () => {
    expect(formatCountdown(0)).toBe("now");
    expect(formatCountdown(-5)).toBe("now");
    expect(formatCountdown(30_000)).toBe("1m");
    expect(formatCountdown(12 * 60_000)).toBe("12m");
    expect(formatCountdown(6 * 3_600_000 + 12 * 60_000)).toBe("6h 12m");
    expect(formatCountdown(2 * 3_600_000)).toBe("2h");
  });
  it("gives local dates", () => {
    expect(localDate(at("2026-11-01T04:00:00Z"), "America/Chicago")).toBe("2026-10-31");
    expect(localDate(at("2026-11-01T04:00:00Z"), "Europe/London")).toBe("2026-11-01");
  });
});
