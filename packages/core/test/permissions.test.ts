import { describe, expect, it } from "vitest";
import {
  canCrew,
  canDeleteShot,
  canEndNight,
  canJoinNight,
  canReviewShot,
  canShoot,
  canStartNight,
  isReaction,
  NIGHT_MAX_PARTICIPANTS,
  shotsLeft,
  validateCrewName,
} from "../src/permissions";

describe("crew actions", () => {
  it("owners can do everything, members the social stuff, outsiders nothing", () => {
    for (const a of ["start_night", "invite", "view", "leave", "set_reunion"] as const) {
      expect(canCrew(a, "member")).toBe(true);
      expect(canCrew(a, "owner")).toBe(true);
      expect(canCrew(a, null)).toBe(false);
    }
    for (const a of ["rename", "remove_member", "delete_crew", "set_moment_schedule"] as const) {
      expect(canCrew(a, "member")).toBe(false);
      expect(canCrew(a, "owner")).toBe(true);
    }
  });
  it("validates crew names", () => {
    expect(validateCrewName("  Night   Owls ")).toEqual({ ok: true, value: "Night Owls" });
    expect(validateCrewName("   ")).toMatchObject({ error: "too_short" });
    expect(validateCrewName("x".repeat(41))).toMatchObject({ error: "too_long" });
  });
});

describe("starting and ending nights", () => {
  it("one live night per crew and per person", () => {
    expect(canStartNight({ role: "member", crewHasLiveNight: false, actorInLiveNight: false })).toMatchObject({ ok: true });
    expect(canStartNight({ role: null, crewHasLiveNight: false, actorInLiveNight: false })).toMatchObject({ error: "not_member" });
    expect(canStartNight({ role: "owner", crewHasLiveNight: true, actorInLiveNight: false })).toMatchObject({ error: "crew_has_live_night" });
    expect(canStartNight({ role: "owner", crewHasLiveNight: false, actorInLiveNight: true })).toMatchObject({ error: "already_in_live_night" });
  });
  it("starter or owner ends", () => {
    expect(canEndNight({ actorId: "maya", startedBy: "maya", role: "member", phase: "live" })).toMatchObject({ ok: true });
    expect(canEndNight({ actorId: "theo", startedBy: "maya", role: "owner", phase: "live" })).toMatchObject({ ok: true });
    expect(canEndNight({ actorId: "jules", startedBy: "maya", role: "member", phase: "live" })).toMatchObject({ error: "not_allowed" });
    expect(canEndNight({ actorId: "maya", startedBy: "maya", role: "member", phase: "developing" })).toMatchObject({ error: "not_live" });
  });
});

describe("joining", () => {
  const base = { phase: "live" as const, alreadyParticipant: false, isCrewMember: true, viaInvite: false, blockedWithAnyParticipant: false, actorInOtherLiveNight: false, participantCount: 3 };
  it("crew members join directly; guests need an invite", () => {
    expect(canJoinNight(base)).toEqual({ ok: true, value: "joined" });
    expect(canJoinNight({ ...base, isCrewMember: false })).toMatchObject({ error: "no_access" });
    expect(canJoinNight({ ...base, isCrewMember: false, viaInvite: true })).toEqual({ ok: true, value: "joined" });
  });
  it("blocked → generic 'unavailable', checked before anything that would leak existence", () => {
    expect(canJoinNight({ ...base, blockedWithAnyParticipant: true, isCrewMember: false, phase: "developing" })).toMatchObject({ error: "unavailable" });
  });
  it("rejoining is idempotent; ended nights can't be joined; one live night per person; cap", () => {
    expect(canJoinNight({ ...base, alreadyParticipant: true, phase: "unlocked" })).toEqual({ ok: true, value: "already" });
    expect(canJoinNight({ ...base, phase: "developing" })).toMatchObject({ error: "not_live" });
    expect(canJoinNight({ ...base, actorInOtherLiveNight: true })).toMatchObject({ error: "already_in_live_night" });
    expect(canJoinNight({ ...base, participantCount: NIGHT_MAX_PARTICIPANTS })).toMatchObject({ error: "full" });
  });
});

describe("the roll", () => {
  it("24 shots, then full", () => {
    expect(canShoot({ isParticipant: true, phase: "live", shotsTaken: 0, rollSize: 24 })).toEqual({ ok: true, value: 23 });
    expect(canShoot({ isParticipant: true, phase: "live", shotsTaken: 23, rollSize: 24 })).toEqual({ ok: true, value: 0 });
    expect(canShoot({ isParticipant: true, phase: "live", shotsTaken: 24, rollSize: 24 })).toMatchObject({ error: "roll_full" });
    expect(canShoot({ isParticipant: true, phase: "developing", shotsTaken: 0, rollSize: 24 })).toMatchObject({ error: "not_live" });
    expect(canShoot({ isParticipant: false, phase: "live", shotsTaken: 0, rollSize: 24 })).toMatchObject({ error: "not_member" });
    expect(shotsLeft(24, 30)).toBe(0);
    expect(shotsLeft(24, 7)).toBe(17);
  });
  it("review is author-only and before the unlock; delete is author-only", () => {
    expect(canReviewShot({ actorId: "maya", authorId: "maya", phase: "developing" })).toMatchObject({ ok: true });
    expect(canReviewShot({ actorId: "maya", authorId: "maya", phase: "live" })).toMatchObject({ ok: true });
    expect(canReviewShot({ actorId: "theo", authorId: "maya", phase: "developing" })).toMatchObject({ error: "not_author" });
    expect(canReviewShot({ actorId: "maya", authorId: "maya", phase: "unlocked" })).toMatchObject({ error: "already_unlocked" });
    expect(canDeleteShot("maya", "maya")).toBe(true);
    expect(canDeleteShot("theo", "maya")).toBe(false);
  });
  it("reactions are a fixed set", () => {
    expect(isReaction("🔥")).toBe(true);
    expect(isReaction("💩")).toBe(false);
  });
});
