import { describe, expect, it } from "vitest";
import {
  advanceNight,
  canMarkReady,
  computeNightSchedule,
  effectiveEarliestUnlock,
  momentSchedule,
  NIGHT_RULES,
  phaseOf,
  rollSizeFor,
  type NightState,
  type ParticipantState,
} from "../src/night";
import { localParts } from "../src/time";

const at = (iso: string) => new Date(iso);
const CHI = "America/Chicago";

function night(startIso: string, tz = CHI, extra: Partial<NightState> = {}): NightState {
  const startedAt = at(startIso);
  return {
    kind: "night",
    tz,
    startedAt,
    endedAt: null,
    unlockedAt: null,
    ...computeNightSchedule(startedAt, tz),
    ...extra,
  };
}
const p = (userId: string, readyAt: string | null = null, shotCount = 3): ParticipantState => ({
  userId,
  readyAt: readyAt ? at(readyAt) : null,
  shotCount,
});

describe("computeNightSchedule", () => {
  it("a 9pm Friday start ends at 5am and unlocks at 10am, sober check from 7am", () => {
    // Fri 30 Oct 2026 21:00 CDT = 02:00Z Sat
    const s = computeNightSchedule(at("2026-10-31T02:00:00Z"), CHI);
    expect(s.autoEndAt.toISOString()).toBe("2026-10-31T10:00:00.000Z"); // 05:00 CDT
    expect(s.earliestUnlockAt.toISOString()).toBe("2026-10-31T12:00:00.000Z"); // 07:00 CDT
    expect(s.unlockAt.toISOString()).toBe("2026-10-31T15:00:00.000Z"); // 10:00 CDT
  });

  it("a day party (1pm) is capped at 12h and unlocks the next morning", () => {
    const s = computeNightSchedule(at("2026-10-31T18:00:00Z"), CHI); // 13:00 CDT
    expect(s.autoEndAt.toISOString()).toBe("2026-11-01T06:00:00.000Z"); // +12h = 01:00 CDT
    expect(localParts(s.unlockAt, CHI)).toMatchObject({ day: 1, hour: 10 });
    expect(localParts(s.earliestUnlockAt, CHI)).toMatchObject({ day: 1, hour: 7 });
  });

  it("a 2am start still gets at least an hour live and 6h before unlock", () => {
    const s = computeNightSchedule(at("2026-10-31T07:00:00Z"), CHI); // 02:00 CDT
    expect(localParts(s.autoEndAt, CHI)).toMatchObject({ day: 31, hour: 5 });
    expect(localParts(s.unlockAt, CHI)).toMatchObject({ day: 31, hour: 10 });
  });

  it("a 4:30am start doesn't end 30 minutes later", () => {
    const start = at("2026-10-31T09:30:00Z"); // 04:30 CDT
    const s = computeNightSchedule(start, CHI);
    expect(s.autoEndAt.getTime() - start.getTime()).toBeGreaterThanOrEqual(
      NIGHT_RULES.minLiveHours * 3_600_000,
    );
    expect(s.unlockAt.getTime() - start.getTime()).toBeGreaterThanOrEqual(6 * 3_600_000);
  });

  it("handles the fall-back night (25-hour day): unlock is 10:00 CST", () => {
    const s = computeNightSchedule(at("2026-11-01T02:00:00Z"), CHI); // Sat 31 Oct 21:00 CDT
    expect(s.autoEndAt.toISOString()).toBe("2026-11-01T11:00:00.000Z"); // 05:00 CST
    expect(s.unlockAt.toISOString()).toBe("2026-11-01T16:00:00.000Z"); // 10:00 CST
  });

  it("handles the spring-forward night: unlock is 10:00 CDT", () => {
    const s = computeNightSchedule(at("2026-03-08T03:00:00Z"), CHI); // Sat 7 Mar 21:00 CST
    expect(s.autoEndAt.toISOString()).toBe("2026-03-08T10:00:00.000Z"); // 05:00 CDT
    expect(s.unlockAt.toISOString()).toBe("2026-03-08T15:00:00.000Z");
  });

  it("works in London across BST end and in Auckland on NYE", () => {
    const lon = computeNightSchedule(at("2026-10-24T20:00:00Z"), "Europe/London"); // 21:00 BST
    expect(lon.unlockAt.toISOString()).toBe("2026-10-25T10:00:00.000Z"); // 10:00 GMT
    const akl = computeNightSchedule(at("2026-12-31T08:00:00Z"), "Pacific/Auckland");
    expect(localParts(akl.unlockAt, "Pacific/Auckland")).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
      hour: 10,
    });
  });

  it("invariant: start < autoEnd ≤ earliest ≤ unlock, for every start hour across a year", () => {
    for (let d = 0; d < 365; d += 7) {
      for (let h = 0; h < 24; h++) {
        const start = new Date(Date.UTC(2026, 0, 1 + d, h, 17));
        for (const tz of [CHI, "Europe/London", "Pacific/Auckland", "Asia/Kolkata", "America/Los_Angeles"]) {
          const s = computeNightSchedule(start, tz);
          expect(s.autoEndAt > start).toBe(true);
          expect(
            s.autoEndAt <= s.earliestUnlockAt || s.earliestUnlockAt.getTime() === s.unlockAt.getTime(),
          ).toBe(true);
          expect(s.earliestUnlockAt <= s.unlockAt).toBe(true);
          expect(s.unlockAt.getTime() - start.getTime()).toBeGreaterThanOrEqual(6 * 3_600_000);
          expect(s.unlockAt.getTime() - start.getTime()).toBeLessThanOrEqual(36 * 3_600_000);
          expect(localParts(s.unlockAt, tz).hour).toBe(10);
        }
      }
    }
  });
});

describe("advanceNight", () => {
  const n = night("2026-10-31T02:00:00Z"); // Fri 21:00 CDT
  const crew = [p("maya"), p("theo"), p("jules")];

  it("stays live before the auto-end", () => {
    const r = advanceNight(n, crew, at("2026-10-31T06:00:00Z"));
    expect(r).toEqual({ phase: "live", changed: false });
  });

  it("auto-ends at 5am into developing", () => {
    const r = advanceNight(n, crew, at("2026-10-31T10:30:00Z"));
    expect(r.phase).toBe("developing");
    expect(r.endedAt?.toISOString()).toBe("2026-10-31T10:00:00.000Z");
    expect(r.changed).toBe(true);
  });

  it("is idempotent once the patch is applied", () => {
    const now = at("2026-10-31T10:30:00Z");
    const r = advanceNight(n, crew, now);
    const after: NightState = { ...n, endedAt: r.endedAt ?? null };
    expect(advanceNight(after, crew, now)).toEqual({ phase: "developing", changed: false });
  });

  it("unlocks at 10am on schedule even if nobody reviewed", () => {
    const r = advanceNight(n, crew, at("2026-10-31T15:00:00Z"));
    expect(r.phase).toBe("unlocked");
    expect(r.reason).toBe("scheduled");
    expect(r.unlockedAt?.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(r.endedAt?.toISOString()).toBe("2026-10-31T10:00:00.000Z");
  });

  it("unlocks early when everyone is up after 7am", () => {
    const ended = { ...n, endedAt: at("2026-10-31T08:00:00Z") };
    const ready = [
      p("maya", "2026-10-31T12:10:00Z"),
      p("theo", "2026-10-31T12:20:00Z"),
      p("jules", "2026-10-31T12:30:00Z"),
    ];
    const r = advanceNight(ended, ready, at("2026-10-31T12:30:00Z"));
    expect(r).toMatchObject({ phase: "unlocked", reason: "everyone_ready" });
    expect(r.unlockedAt?.toISOString()).toBe("2026-10-31T12:30:00.000Z");
  });

  it("does not count a 3am 'I'm good' (sober check)", () => {
    const ended = { ...n, endedAt: at("2026-10-31T08:00:00Z") };
    const ready = [
      p("maya", "2026-10-31T08:05:00Z"),
      p("theo", "2026-10-31T12:20:00Z"),
      p("jules", "2026-10-31T12:30:00Z"),
    ];
    expect(advanceNight(ended, ready, at("2026-10-31T13:00:00Z")).phase).toBe("developing");
  });

  it("waits for everyone", () => {
    const ended = { ...n, endedAt: at("2026-10-31T08:00:00Z") };
    const ready = [p("maya", "2026-10-31T12:10:00Z"), p("theo", null), p("jules", "2026-10-31T12:30:00Z")];
    expect(advanceNight(ended, ready, at("2026-10-31T13:00:00Z")).phase).toBe("developing");
  });

  it("never unlocks early with zero participants", () => {
    const ended = { ...n, endedAt: at("2026-10-31T08:00:00Z") };
    expect(advanceNight(ended, [], at("2026-10-31T13:00:00Z")).phase).toBe("developing");
  });

  it("is a no-op once unlocked", () => {
    const done = { ...n, endedAt: at("2026-10-31T10:00:00Z"), unlockedAt: at("2026-10-31T15:00:00Z") };
    expect(advanceNight(done, crew, at("2026-11-02T00:00:00Z"))).toEqual({
      phase: "unlocked",
      changed: false,
    });
  });
});

describe("moments", () => {
  const opens = at("2026-10-31T02:00:00Z");
  const closes = at("2026-10-31T04:00:00Z");
  const m: NightState = {
    kind: "moment",
    tz: CHI,
    startedAt: opens,
    endedAt: null,
    unlockedAt: null,
    ...momentSchedule(opens, closes),
  };

  it("stays live until everyone has posted", () => {
    expect(advanceNight(m, [p("a", null, 1), p("b", null, 0)], at("2026-10-31T03:00:00Z")).phase).toBe(
      "live",
    );
  });
  it("reveals as soon as everyone has posted", () => {
    const r = advanceNight(m, [p("a", null, 1), p("b", null, 1)], at("2026-10-31T03:00:00Z"));
    expect(r).toMatchObject({ phase: "unlocked", reason: "everyone_posted" });
  });
  it("reveals at the window close otherwise", () => {
    const r = advanceNight(m, [p("a", null, 1), p("b", null, 0)], at("2026-10-31T04:00:01Z"));
    expect(r).toMatchObject({ phase: "unlocked", reason: "window_closed" });
    expect(r.unlockedAt?.toISOString()).toBe(closes.toISOString());
  });
  it("rolls are 1 for moments, 24 for nights", () => {
    expect(rollSizeFor("moment")).toBe(1);
    expect(rollSizeFor("night")).toBe(24);
    expect(rollSizeFor("city")).toBe(24);
  });
});

describe("canMarkReady / effectiveEarliestUnlock", () => {
  const n = night("2026-10-31T02:00:00Z");
  it("is not allowed while live", () => {
    expect(canMarkReady(n, at("2026-10-31T05:00:00Z"))).toEqual({ ok: false, error: "not_developing" });
  });
  it("is too early before 7am, and says when it counts", () => {
    const ended = { ...n, endedAt: at("2026-10-31T07:00:00Z") };
    const r = canMarkReady(ended, at("2026-10-31T09:00:00Z"));
    expect(r).toMatchObject({ ok: false, error: "too_early" });
    if (!r.ok) expect(r.countsFrom?.toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });
  it("is fine after 7am", () => {
    const ended = { ...n, endedAt: at("2026-10-31T07:00:00Z") };
    expect(canMarkReady(ended, at("2026-10-31T12:01:00Z"))).toEqual({ ok: true });
  });
  it("a hand-ended night keeps its own morning's 7am", () => {
    expect(effectiveEarliestUnlock(n, at("2026-10-31T05:00:00Z"), CHI).toISOString()).toBe(
      "2026-10-31T12:00:00.000Z",
    );
    expect(effectiveEarliestUnlock(n, null, CHI).toISOString()).toBe(n.earliestUnlockAt.toISOString());
  });
  it("phaseOf reads persisted state", () => {
    expect(phaseOf({ endedAt: null, unlockedAt: null })).toBe("live");
    expect(phaseOf({ endedAt: at("2026-01-01T00:00:00Z"), unlockedAt: null })).toBe("developing");
    expect(phaseOf({ endedAt: at("2026-01-01T00:00:00Z"), unlockedAt: at("2026-01-01T00:00:00Z") })).toBe(
      "unlocked",
    );
  });
});
