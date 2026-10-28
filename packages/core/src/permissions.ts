// Who may do what. Mirrored by RLS policies; these give the friendly error before the DB says no.
import type { NightPhase } from "./night";
import { err, ok, type Result } from "./result";

export type CrewRole = "owner" | "member";
export type CrewKind = "local" | "long_distance";

export const CREW_LIMITS = { minNameLength: 1, maxNameLength: 40, maxMembers: 20 } as const;

export type CrewAction =
  | "start_night"
  | "invite"
  | "view"
  | "leave"
  | "rename"
  | "remove_member"
  | "delete_crew"
  | "set_reunion"
  | "set_moment_schedule";

const OWNER_ONLY: ReadonlySet<CrewAction> = new Set([
  "rename",
  "remove_member",
  "delete_crew",
  "set_moment_schedule",
]);

export function canCrew(action: CrewAction, role: CrewRole | null): boolean {
  if (!role) return false;
  if (OWNER_ONLY.has(action)) return role === "owner";
  return true;
}

export type StartNightError = "not_member" | "crew_has_live_night" | "already_in_live_night";

export function canStartNight(input: {
  role: CrewRole | null;
  crewHasLiveNight: boolean;
  actorInLiveNight: boolean;
}): Result<undefined, StartNightError> {
  if (!input.role) return err("not_member");
  if (input.crewHasLiveNight) return err("crew_has_live_night");
  if (input.actorInLiveNight) return err("already_in_live_night");
  return ok();
}

export type JoinNightError = "not_live" | "already_in_live_night" | "no_access" | "unavailable" | "full";

export const NIGHT_MAX_PARTICIPANTS = 30;

/**
 * Joining a night: crew members join directly; anyone else needs the night's code / QR / invite.
 * A block between the joiner and any participant returns the generic "unavailable", the same error
 * as a wrong code, so a blocked person can't learn they're blocked or that the night exists.
 */
export function canJoinNight(input: {
  phase: NightPhase;
  alreadyParticipant: boolean;
  isCrewMember: boolean;
  viaInvite: boolean;
  blockedWithAnyParticipant: boolean;
  actorInOtherLiveNight: boolean;
  participantCount: number;
}): Result<"joined" | "already", JoinNightError> {
  if (input.alreadyParticipant) return ok("already");
  if (input.blockedWithAnyParticipant) return err("unavailable");
  if (!input.isCrewMember && !input.viaInvite) return err("no_access");
  if (input.phase !== "live") return err("not_live");
  if (input.actorInOtherLiveNight) return err("already_in_live_night");
  if (input.participantCount >= NIGHT_MAX_PARTICIPANTS) return err("full");
  return ok("joined");
}

export type EndNightError = "not_allowed" | "not_live";

/** The person who started it or a crew owner may end a night early. */
export function canEndNight(input: {
  actorId: string;
  startedBy: string;
  role: CrewRole | null;
  phase: NightPhase;
}): Result<undefined, EndNightError> {
  if (input.phase !== "live") return err("not_live");
  if (input.actorId !== input.startedBy && input.role !== "owner") return err("not_allowed");
  return ok();
}

export type ShootError = "not_member" | "not_live" | "roll_full";

export function canShoot(input: {
  isParticipant: boolean;
  phase: NightPhase;
  shotsTaken: number;
  rollSize: number;
}): Result<number, ShootError> {
  if (!input.isParticipant) return err("not_member");
  if (input.phase !== "live") return err("not_live");
  if (input.shotsTaken >= input.rollSize) return err("roll_full");
  return ok(input.rollSize - input.shotsTaken - 1);
}

export function shotsLeft(rollSize: number, shotsTaken: number): number {
  return Math.max(0, rollSize - shotsTaken);
}

export type ReviewError = "not_author" | "already_unlocked";

/** Keep / toss your own shots, while live or developing. After the unlock it's "delete" instead. */
export function canReviewShot(input: {
  actorId: string;
  authorId: string;
  phase: NightPhase;
}): Result<undefined, ReviewError> {
  if (input.actorId !== input.authorId) return err("not_author");
  if (input.phase === "unlocked") return err("already_unlocked");
  return ok();
}

export function canDeleteShot(actorId: string, authorId: string): boolean {
  return actorId === authorId;
}

export const REACTIONS = ["🔥", "😂", "😍", "✨", "🫶"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const isReaction = (s: string): s is Reaction => (REACTIONS as readonly string[]).includes(s);

export function validateCrewName(name: string): Result<string, "too_short" | "too_long"> {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < CREW_LIMITS.minNameLength) return err("too_short");
  if (n.length > CREW_LIMITS.maxNameLength) return err("too_long");
  return ok(n);
}
