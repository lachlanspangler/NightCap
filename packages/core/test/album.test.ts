import { describe, expect, it } from "vitest";
import { assembleAlbum, blockKey, canSeeShot, shotVisibility, type ShotFacts } from "../src/album";
import { VISIBILITY_CASES } from "./fixtures/visibility";

const at = (m: number) => new Date(Date.UTC(2026, 9, 31, 3, m));

describe("canSeeShot (shared fixture with RLS)", () => {
  for (const c of VISIBILITY_CASES) {
    it(c.name, () => {
      const shot: ShotFacts = { id: "s1", authorId: c.author, status: c.status, takenAt: at(0), hiddenBy: c.hiddenBy ?? [] };
      const blocks = new Set((c.blocks ?? []).map(([a, b]) => blockKey(a, b)));
      expect(canSeeShot(shot, { viewerId: c.viewer, isParticipant: c.participants.includes(c.viewer), phase: c.phase, blocks })).toBe(c.expected);
    });
  }
});

describe("shotVisibility reasons", () => {
  const base: ShotFacts = { id: "s", authorId: "maya", status: "held", takenAt: at(0), hiddenBy: [] };
  const ctx = { viewerId: "theo", isParticipant: true, phase: "unlocked" as const, blocks: new Set<string>() };
  it("explains each outcome", () => {
    expect(shotVisibility(base, ctx)).toBe("visible");
    expect(shotVisibility(base, { ...ctx, phase: "live" })).toBe("locked");
    expect(shotVisibility(base, { ...ctx, isParticipant: false })).toBe("not_member");
    expect(shotVisibility({ ...base, status: "discarded" }, ctx)).toBe("discarded");
    expect(shotVisibility({ ...base, hiddenBy: ["theo"] }, ctx)).toBe("hidden");
    expect(shotVisibility(base, { ...ctx, blocks: new Set([blockKey("maya", "theo")]) })).toBe("blocked");
    expect(shotVisibility(base, { ...ctx, viewerId: "maya" })).toBe("own");
    expect(shotVisibility({ ...base, status: "deleted" }, { ...ctx, viewerId: "maya" })).toBe("deleted");
  });
});

describe("assembleAlbum", () => {
  const shots: ShotFacts[] = [
    { id: "a", authorId: "theo", status: "held", takenAt: at(30), hiddenBy: [] },
    { id: "b", authorId: "maya", status: "kept", takenAt: at(10), hiddenBy: [] },
    { id: "c", authorId: "jules", status: "discarded", takenAt: at(20), hiddenBy: [] },
    { id: "d", authorId: "jules", status: "held", takenAt: at(40), hiddenBy: ["maya"] },
    { id: "e", authorId: "maya", status: "held", takenAt: at(50), hiddenBy: ["jules"] },
    { id: "f", authorId: "theo", status: "deleted", takenAt: at(5), hiddenBy: [] },
  ];
  const participantIds = ["maya", "theo", "jules"];

  it("while live: only my own shots, plus counts for the teaser", () => {
    const album = assembleAlbum({ viewerId: "maya", phase: "live", participantIds, shots, blocks: new Set() });
    expect(album.shots.map((s) => s.id)).toEqual(["b", "e"]);
    expect(album.mine.map((s) => s.id)).toEqual(["b", "e"]);
    expect(album.counts).toEqual([
      { userId: "maya", count: 2 },
      { userId: "theo", count: 1 },
      { userId: "jules", count: 1 },
    ]);
    expect(album.total).toBe(4);
  });

  it("after unlock: everyone's visible shots in time order, author sees own hidden one flagged", () => {
    const album = assembleAlbum({ viewerId: "maya", phase: "unlocked", participantIds, shots, blocks: new Set() });
    expect(album.shots.map((s) => s.id)).toEqual(["b", "a", "e"]);
    expect(album.shots.find((s) => s.id === "e")?.hiddenFromOthers).toBe(true);
    expect(album.shots.find((s) => s.id === "b")?.hiddenFromOthers).toBe(false);
  });

  it("after unlock for theo: hidden and discarded shots are gone", () => {
    const album = assembleAlbum({ viewerId: "theo", phase: "unlocked", participantIds, shots, blocks: new Set() });
    expect(album.shots.map((s) => s.id)).toEqual(["b", "a"]);
    expect(album.shots.every((s) => !s.hiddenFromOthers)).toBe(true);
  });

  it("blocks remove the author from counts and the album, both ways", () => {
    const blocks = new Set([blockKey("jules", "maya")]);
    const album = assembleAlbum({ viewerId: "maya", phase: "live", participantIds, shots, blocks });
    expect(album.counts.map((c) => c.userId)).toEqual(["maya", "theo"]);
    const jules = assembleAlbum({ viewerId: "jules", phase: "unlocked", participantIds, shots, blocks });
    expect(jules.shots.map((s) => s.authorId)).not.toContain("maya");
  });

  it("non-participants get nothing, not even counts", () => {
    const album = assembleAlbum({ viewerId: "sam", phase: "unlocked", participantIds, shots, blocks: new Set() });
    expect(album.shots).toEqual([]);
    expect(album.total).toBe(0);
  });
});
