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

describe("formTables with blocks", () => {
  it("opens another table rather than waitlisting a blocked pair", () => {
    const r = formTables(
      [solo("a"), solo("b"), solo("c"), solo("d")],
      { min: 2, max: 4 },
      pairSet([["a", "b"]]),
    );
    expect(r.waitlist).toEqual([]);
    expect(r.tables).toHaveLength(2);
    for (const t of r.tables) expect(t.userIds.includes("a") && t.userIds.includes("b")).toBe(false);
  });
});

describe("formTables properties (seeded fuzz)", () => {
  // Small LCG so the "random" ids are the same every run.
  const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  it("with one blocked pair and enough people for two tables, nobody is waitlisted", () => {
    const rnd = lcg(42);
    for (let k = 0; k < 3000; k++) {
      const n = 4 + Math.floor(rnd() * 9); // 4–12 people
      const ids = Array.from({ length: n }, () =>
        Math.floor(rnd() * 2 ** 32)
          .toString(16)
          .padStart(8, "0"),
      );
      const blocks = ids.map((id) => ({
        blockId: id,
        members: [{ userId: id, gender: "unspecified" as Gender }],
      }));
      const r = formTables(blocks, { min: 2, max: 4 }, pairSet([[ids[0]!, ids[1]!]]));
      expect(r.waitlist).toEqual([]);
      for (const t of r.tables) {
        expect(t.userIds.length).toBeGreaterThanOrEqual(2);
        expect(t.userIds.length).toBeLessThanOrEqual(4);
        expect(t.userIds.includes(ids[0]!) && t.userIds.includes(ids[1]!)).toBe(false);
      }
    }
  });
});

describe("formTables never seats a blocked pair, even inside one group", () => {
  it("splits a group block that contains a blocked pair", () => {
    const group: SignupBlock = {
      blockId: "g",
      members: [
        { userId: "a", gender: "unspecified" },
        { userId: "b", gender: "unspecified" },
      ],
    };
    const r = formTables([group, solo("c"), solo("d")], { min: 2, max: 4 }, pairSet([["a", "b"]]));
    for (const t of r.tables) expect(t.userIds.includes("a") && t.userIds.includes("b")).toBe(false);
    expect(r.tables.flatMap((t) => t.userIds).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("no woman who came alone is the only woman at a table (privacy review M3)", () => {
  // "Alone" = the only person at a table of 3+ who isn't a man, having signed up solo.
  const lone = (r: ReturnType<typeof formTables>, blocks: SignupBlock[]) =>
    r.tables.some((t) => {
      const blockOf = (u: string) => blocks.find((b) => b.members.some((m) => m.userId === u))!;
      const g = (u: string) => blockOf(u).members.find((m) => m.userId === u)!.gender;
      const nonMen = t.userIds.filter((u) => g(u) === "woman" || g(u) === "nonbinary");
      return t.userIds.length >= 3 && nonMen.length === 1 && blockOf(nonMen[0]!).members.length === 1;
    });
  it("one woman among men is waitlisted, not seated alone", () => {
    const blocks = [solo("w", "woman"), ...["a", "b", "c", "d", "e"].map((m) => solo(m, "man"))];
    const r = formTables(blocks, opts, new Set());
    expect(lone(r, blocks)).toBe(false);
    expect(r.waitlist).toContain("w");
  });
  it("a woman who came with friends isn't 'alone'", () => {
    const blocks: SignupBlock[] = [
      {
        blockId: "crew",
        members: [
          { userId: "w", gender: "woman" },
          { userId: "m0", gender: "man" },
        ],
      },
      ...["a", "b", "c"].map((m) => solo(m, "man")),
    ];
    expect(formTables(blocks, opts, new Set()).waitlist).toEqual([]);
  });
  it("seeded fuzz: never a lone solo woman", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let k = 0; k < 1500; k++) {
      const n = 4 + Math.floor(rnd() * 12);
      const blocks = Array.from({ length: n }, (_, i) =>
        solo(`u${k}-${i}`, rnd() < 0.4 ? "woman" : rnd() < 0.9 ? "man" : "nonbinary"),
      );
      const r = formTables(blocks, opts, new Set());
      expect(lone(r, blocks)).toBe(false);
      for (const t of r.tables) {
        expect(t.userIds.length).toBeGreaterThanOrEqual(opts.min);
        expect(t.userIds.length).toBeLessThanOrEqual(opts.max);
      }
    }
  });
});
