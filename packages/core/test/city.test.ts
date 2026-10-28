import { describe, expect, it } from "vitest";
import {
  canJoinCityNights,
  CODE_OF_CONDUCT,
  formTables,
  mutualMatches,
  pairSet,
  tableRevealed,
  type Gender,
  type SignupBlock,
} from "../src";

const solo = (id: string, gender: Gender = "unspecified"): SignupBlock => ({
  blockId: id,
  members: [{ userId: id, gender }],
});
const crew = (id: string, ...ids: string[]): SignupBlock => ({
  blockId: id,
  members: ids.map((userId) => ({ userId, gender: "unspecified" as Gender })),
});
const opts = { min: 4, max: 6 };

describe("formTables", () => {
  it("seats everyone within bounds", () => {
    const blocks = Array.from({ length: 17 }, (_, k) => solo(`u${String(k).padStart(2, "0")}`));
    const r = formTables(blocks, opts, new Set());
    expect(r.waitlist).toEqual([]);
    expect(r.tables.flatMap((t) => t.userIds).sort()).toEqual(blocks.map((b) => b.blockId).sort());
    for (const t of r.tables) {
      expect(t.userIds.length).toBeGreaterThanOrEqual(4);
      expect(t.userIds.length).toBeLessThanOrEqual(6);
    }
  });
  it("keeps crews together", () => {
    const blocks = [
      crew("c1", "a", "b", "c"),
      crew("c2", "d", "e"),
      solo("f"),
      solo("g"),
      solo("h"),
      solo("i"),
      solo("j"),
    ];
    const r = formTables(blocks, opts, new Set());
    const tableOf = (u: string) => r.tables.findIndex((t) => t.userIds.includes(u));
    expect(new Set(["a", "b", "c"].map(tableOf)).size).toBe(1);
    expect(tableOf("d")).toBe(tableOf("e"));
  });
  it("never seats a blocked pair together", () => {
    const blocks = Array.from({ length: 10 }, (_, k) => solo(`u${k}`));
    const blocked = pairSet([
      ["u0", "u1"],
      ["u2", "u3"],
      ["u0", "u4"],
    ]);
    const r = formTables(blocks, opts, blocked);
    for (const t of r.tables) {
      for (const [a, b] of [
        ["u0", "u1"],
        ["u2", "u3"],
        ["u0", "u4"],
      ])
        expect(t.userIds.includes(a!) && t.userIds.includes(b!)).toBe(false);
    }
  });
  it("waitlists when there aren't enough people", () => {
    expect(formTables([solo("a"), solo("b"), solo("c")], opts, new Set())).toEqual({
      tables: [],
      waitlist: ["a", "b", "c"],
    });
  });
  it("waitlists blocks bigger than a table", () => {
    const r = formTables(
      [crew("big", "a", "b", "c", "d", "e", "f", "g"), solo("h"), solo("i"), solo("j"), solo("k")],
      opts,
      new Set(),
    );
    expect(r.waitlist).toContain("big");
  });
  it("avoids leaving someone the only woman at a table when it can", () => {
    const blocks = [
      solo("w1", "woman"),
      solo("w2", "woman"),
      solo("w3", "woman"),
      solo("w4", "woman"),
      solo("m1", "man"),
      solo("m2", "man"),
      solo("m3", "man"),
      solo("m4", "man"),
    ];
    const r = formTables(blocks, opts, new Set());
    for (const t of r.tables) expect(t.userIds.filter((u) => u.startsWith("w")).length).not.toBe(1);
  });
  it("spreads people who've met before", () => {
    const blocks = Array.from({ length: 8 }, (_, k) => solo(`u${k}`));
    const met = pairSet([["u0", "u1"]]);
    const r = formTables(blocks, opts, new Set(), met);
    expect(r.tables.some((t) => t.userIds.includes("u0") && t.userIds.includes("u1"))).toBe(false);
  });
  it("is deterministic", () => {
    const blocks = Array.from({ length: 13 }, (_, k) => solo(`u${k}`, k % 2 ? "woman" : "man"));
    expect(formTables(blocks, opts, new Set())).toEqual(formTables([...blocks].reverse(), opts, new Set()));
  });
});

describe("keep in touch", () => {
  it("only mutual yes matches; one-sided and no are invisible", () => {
    const r = mutualMatches([
      { eventId: "e", fromUserId: "a", toUserId: "b", yes: true },
      { eventId: "e", fromUserId: "b", toUserId: "a", yes: true },
      { eventId: "e", fromUserId: "a", toUserId: "c", yes: true },
      { eventId: "e", fromUserId: "c", toUserId: "a", yes: false },
      { eventId: "e", fromUserId: "d", toUserId: "b", yes: true },
      { eventId: "other", fromUserId: "b", toUserId: "d", yes: true },
    ]);
    expect(r).toEqual([["a", "b"]]);
  });
});

describe("city gate", () => {
  const ok = { is21: true, ageVerified: true, cocAcceptedAt: new Date(0), cityOptIn: true };
  it("needs 21, opt-in, code of conduct and verification", () => {
    expect(canJoinCityNights(ok)).toMatchObject({ ok: true });
    expect(canJoinCityNights({ ...ok, is21: false })).toMatchObject({ error: "not_21" });
    expect(canJoinCityNights({ ...ok, cityOptIn: false })).toMatchObject({ error: "not_opted_in" });
    expect(canJoinCityNights({ ...ok, cocAcceptedAt: null })).toMatchObject({ error: "no_code_of_conduct" });
    expect(canJoinCityNights({ ...ok, ageVerified: false })).toMatchObject({ error: "not_verified" });
  });
  it("reveals tables 2h before; has a short code of conduct", () => {
    const start = new Date("2026-10-31T01:00:00Z");
    expect(tableRevealed(start, new Date("2026-10-30T22:59:00Z"))).toBe(false);
    expect(tableRevealed(start, new Date("2026-10-30T23:00:00Z"))).toBe(true);
    expect(CODE_OF_CONDUCT).toHaveLength(4);
  });
});
