import { describe, expect, it } from "vitest";
import {
  computeNudges,
  currentOrNextMoment,
  DEFAULT_MOMENT,
  describeMoment,
  describeMonth,
  monthInReview,
  nightDate,
  nudgeCopy,
  onThisNight,
  pastMoments,
  validateMomentSchedule,
  type ClosedMoment,
  type NudgeMember,
  type RecapNight,
} from "../src";

const at = (iso: string) => new Date(iso);
const CHI = "America/Chicago";

describe("weekly moment windows", () => {
  it("next Friday 9pm in the crew's zone", () => {
    const w = currentOrNextMoment(at("2026-10-28T17:00:00Z"), CHI); // Wed noon
    expect(w.opensAt.toISOString()).toBe("2026-10-31T02:00:00.000Z"); // Fri 30 Oct 21:00 CDT
    expect(w.closesAt.toISOString()).toBe("2026-10-31T04:00:00.000Z");
    expect(w.isOpen).toBe(false);
  });
  it("is open during the window, and crosses midnight UTC fine", () => {
    const w = currentOrNextMoment(at("2026-10-31T03:00:00Z"), CHI);
    expect(w.isOpen).toBe(true);
    expect(w.opensAt.toISOString()).toBe("2026-10-31T02:00:00.000Z");
  });
  it("after it closes, it's next week", () => {
    const w = currentOrNextMoment(at("2026-10-31T04:00:00Z"), CHI);
    expect(w.opensAt.toISOString()).toBe("2026-11-07T03:00:00.000Z"); // CST now
  });
  it("lists past windows newest first", () => {
    const past = pastMoments(at("2026-11-01T00:00:00Z"), CHI, 3);
    expect(past.map((w) => w.opensAt.toISOString())).toEqual([
      "2026-10-31T02:00:00.000Z",
      "2026-10-24T02:00:00.000Z",
      "2026-10-17T02:00:00.000Z",
    ]);
  });
  it("validates and describes schedules", () => {
    expect(validateMomentSchedule(DEFAULT_MOMENT)).toBe(true);
    expect(validateMomentSchedule({ ...DEFAULT_MOMENT, weekday: 7 })).toBe(false);
    expect(validateMomentSchedule({ ...DEFAULT_MOMENT, durationMinutes: 10 })).toBe(false);
    expect(describeMoment(DEFAULT_MOMENT)).toBe("Fridays at 9pm · 2h window");
    expect(describeMoment({ weekday: 0, hour: 19, minute: 30, durationMinutes: 90 })).toBe(
      "Sundays at 7:30pm · 90m window",
    );
  });
});

describe("recaps", () => {
  const n = (id: string, iso: string, unlocked = true, city: string | null = "Minneapolis"): RecapNight => ({
    id,
    title: id,
    startedAt: at(iso),
    tz: CHI,
    unlocked,
    city,
  });
  it("a 1am start belongs to the night before", () => {
    expect(nightDate(at("2026-10-31T06:00:00Z"), CHI)).toMatchObject({ month: 10, day: 30 }); // Sat 01:00 → Fri
  });
  it("on this night: same date in past years only, unlocked only", () => {
    const nights = [
      n("last-year", "2025-10-31T02:00:00Z"),
      n("two-years", "2024-10-31T02:00:00Z"),
      n("this-year", "2026-10-31T02:00:00Z"),
      n("locked", "2023-10-31T02:00:00Z", false),
      n("other-day", "2025-10-20T02:00:00Z"),
    ];
    const r = onThisNight(nights, at("2026-10-31T03:00:00Z"), CHI);
    expect(r.map((x) => [x.night.id, x.yearsAgo])).toEqual([
      ["last-year", 1],
      ["two-years", 2],
    ]);
  });
  it("month in review counts nights, photos, people, cities, top shot", () => {
    const nights = [
      n("a", "2026-10-03T02:00:00Z", true, "Minneapolis"),
      n("b", "2026-10-17T02:00:00Z", true, "Chicago"),
      n("c", "2026-11-07T02:00:00Z"),
    ];
    const shots = [
      { id: "s1", nightId: "a", authorId: "maya", takenAt: at("2026-10-03T03:00:00Z"), reactions: 1 },
      { id: "s2", nightId: "a", authorId: "theo", takenAt: at("2026-10-03T04:00:00Z"), reactions: 5 },
      { id: "s3", nightId: "b", authorId: "maya", takenAt: at("2026-10-17T03:00:00Z"), reactions: 0 },
      { id: "s4", nightId: "c", authorId: "jules", takenAt: at("2026-11-07T03:00:00Z"), reactions: 9 },
    ];
    const r = monthInReview(nights, shots, 2026, 10, CHI);
    expect(r).toMatchObject({
      nights: 2,
      photos: 3,
      people: 2,
      cities: ["Chicago", "Minneapolis"],
      topShotId: "s2",
      busiestNightId: "a",
    });
    expect(describeMonth(r, "Night Owls")).toBe("October with Night Owls: 2 nights, 3 photos, 2 cities");
    expect(monthInReview(nights, shots, 2026, 1, CHI)).toMatchObject({
      nights: 0,
      photos: 0,
      topShotId: null,
    });
  });
});

describe("nudges", () => {
  const members: NudgeMember[] = ["maya", "theo", "jules", "priya"].map((userId) => ({
    userId,
    joinedAt: at("2026-01-01T00:00:00Z"),
    mutedUntil: null,
  }));
  const w = (iso: string, posted: string[]): ClosedMoment => ({
    opensAt: at(iso),
    closesAt: new Date(at(iso).getTime() + 7_200_000),
    postedUserIds: posted,
  });
  const closed = [
    w("2026-10-24T02:00:00Z", ["maya", "theo"]),
    w("2026-10-17T02:00:00Z", ["maya"]),
    w("2026-10-10T02:00:00Z", ["maya", "theo"]),
  ];
  const now = at("2026-10-28T17:00:00Z");

  it("nudges an active friend about the quiet one, never the quiet one", () => {
    const r = computeNudges({ members, closedMoments: closed, openMoment: null, sent: [], now });
    expect(r).toEqual([
      { toUserId: "maya", aboutUserId: "jules", kind: "quiet_friend" },
      { toUserId: "theo", aboutUserId: "priya", kind: "quiet_friend" },
    ]);
    expect(r.some((x) => x.toUserId === x.aboutUserId)).toBe(false);
  });
  it("respects per-recipient and per-subject limits", () => {
    const sent = [
      {
        toUserId: "maya",
        aboutUserId: "priya",
        kind: "quiet_friend" as const,
        sentAt: at("2026-10-26T00:00:00Z"),
      },
    ];
    const r = computeNudges({ members, closedMoments: closed, openMoment: null, sent, now });
    expect(r).toEqual([{ toUserId: "theo", aboutUserId: "jules", kind: "quiet_friend" }]);
  });
  it("new members aren't 'quiet', muted members aren't nudged", () => {
    const fresh = members.map((m) =>
      m.userId === "jules"
        ? { ...m, joinedAt: at("2026-10-20T00:00:00Z") }
        : m.userId === "maya"
          ? { ...m, mutedUntil: at("2027-01-01T00:00:00Z") }
          : m,
    );
    const r = computeNudges({ members: fresh, closedMoments: closed, openMoment: null, sent: [], now });
    expect(r).toEqual([{ toUserId: "theo", aboutUserId: "priya", kind: "quiet_friend" }]);
  });
  it("needs three closed moments of history", () => {
    expect(
      computeNudges({ members, closedMoments: closed.slice(0, 2), openMoment: null, sent: [], now }),
    ).toEqual([]);
  });
  it("reminds non-posters 30 min before close, once", () => {
    const open = { closesAt: at("2026-10-31T04:00:00Z"), postedUserIds: ["maya"] };
    const t = at("2026-10-31T03:40:00Z");
    const r = computeNudges({ members, closedMoments: [], openMoment: open, sent: [], now: t });
    expect(r.map((x) => x.toUserId)).toEqual(["theo", "jules", "priya"]);
    const again = computeNudges({
      members,
      closedMoments: [],
      openMoment: open,
      sent: r.map((x) => ({ ...x, sentAt: t })),
      now: at("2026-10-31T03:50:00Z"),
    });
    expect(again).toEqual([]);
    expect(
      computeNudges({
        members,
        closedMoments: [],
        openMoment: open,
        sent: [],
        now: at("2026-10-31T03:00:00Z"),
      }),
    ).toEqual([]);
  });
  it("copy never shames", () => {
    const text = nudgeCopy(
      { toUserId: "maya", aboutUserId: "jules", kind: "quiet_friend" },
      { jules: "Jules" },
    );
    expect(text).toContain("Jules");
    expect(text).not.toMatch(/streak|lazy|ignor/i);
  });
});

describe("nudges respect blocks and mutes (privacy review M1)", () => {
  const at = (iso: string) => new Date(iso);
  const members = ["maya", "theo", "jules"].map((userId) => ({
    userId,
    joinedAt: at("2026-01-01T00:00:00Z"),
    mutedUntil: null as Date | null,
  }));
  const w = (iso: string, posted: string[]) => ({
    opensAt: at(iso),
    closesAt: new Date(at(iso).getTime() + 7_200_000),
    postedUserIds: posted,
  });
  const closed = [
    w("2026-10-24T02:00:00Z", ["maya", "theo"]),
    w("2026-10-17T02:00:00Z", ["maya", "theo"]),
    w("2026-10-10T02:00:00Z", ["maya", "theo"]),
  ];
  const now = at("2026-10-28T17:00:00Z");
  it("never nudges someone about a person they blocked (or who blocked them)", () => {
    const r = computeNudges({
      members,
      closedMoments: closed,
      openMoment: null,
      sent: [],
      now,
      blockedPairs: new Set(["jules|maya"]),
    });
    expect(r).toEqual([{ toUserId: "theo", aboutUserId: "jules", kind: "quiet_friend" }]);
  });
  it("never nudges about someone who muted the crew", () => {
    const muted = members.map((m) =>
      m.userId === "jules" ? { ...m, mutedUntil: at("2027-01-01T00:00:00Z") } : m,
    );
    expect(computeNudges({ members: muted, closedMoments: closed, openMoment: null, sent: [], now })).toEqual(
      [],
    );
  });
});
