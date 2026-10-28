// Shot visibility and album assembly (ADR 0004). The SQL function nightcap.can_see_shot()
// implements the same predicate; test/fixtures/visibility.ts is run against both.
import type { NightPhase } from "./night";

export type ShotStatus = "held" | "kept" | "discarded" | "deleted";

export interface ShotFacts {
  id: string;
  authorId: string;
  status: ShotStatus;
  takenAt: Date;
  /** Users with an active hide on this shot ("that's me, hide it", or a subject-category report). */
  hiddenBy: readonly string[];
  /** Sticky hide left by a subject whose account is gone (migration 0005). */
  subjectHidden?: boolean;
  /** People who reported it: a report always hides the shot from the reporter (ADR 0004). */
  reportedBy?: readonly string[];
}

/** Blocks as "blocker:blocked" keys. Blocks are mutual invisibility, so we check both directions. */
export type BlockSet = ReadonlySet<string>;
export const blockKey = (blocker: string, blocked: string) => `${blocker}:${blocked}`;
export function blockedEitherWay(blocks: BlockSet, a: string, b: string): boolean {
  return a !== b && (blocks.has(blockKey(a, b)) || blocks.has(blockKey(b, a)));
}

export interface ViewerContext {
  viewerId: string;
  isParticipant: boolean;
  phase: NightPhase;
  blocks: BlockSet;
}

export type ShotVisibility =
  | "own" // the author always sees their own (non-deleted) shot
  | "visible"
  | "not_member"
  | "locked" // the night hasn't unlocked
  | "discarded" // the author tossed it in the morning review
  | "deleted"
  | "hidden" // someone in it hid it
  | "blocked";

/** Why the viewer can or can't see the shot. The first failing rule wins (order is part of the contract). */
export function shotVisibility(shot: ShotFacts, ctx: ViewerContext): ShotVisibility {
  if (shot.status === "deleted") return "deleted";
  if (shot.authorId === ctx.viewerId) return "own";
  if (!ctx.isParticipant) return "not_member";
  if (ctx.phase !== "unlocked") return "locked";
  if (shot.status === "discarded") return "discarded";
  if (shot.hiddenBy.length > 0 || shot.subjectHidden) return "hidden";
  if (shot.reportedBy?.includes(ctx.viewerId)) return "hidden";
  if (blockedEitherWay(ctx.blocks, ctx.viewerId, shot.authorId)) return "blocked";
  return "visible";
}

export function canSeeShot(shot: ShotFacts, ctx: ViewerContext): boolean {
  const v = shotVisibility(shot, ctx);
  return v === "own" || v === "visible";
}

export interface ShotView {
  id: string;
  authorId: string;
  takenAt: Date;
  mine: boolean;
  /** Author-only: the shot is hidden from everyone else by someone in it (never says who). */
  hiddenFromOthers: boolean;
  /** Author-only: tossed in the morning review. */
  discarded: boolean;
}

export interface AlbumInput {
  viewerId: string;
  phase: NightPhase;
  participantIds: readonly string[];
  shots: readonly ShotFacts[];
  blocks: BlockSet;
}

export interface Album {
  phase: NightPhase;
  /** Shots the viewer may see, oldest first (the night in order). */
  shots: ShotView[];
  /** The viewer's own shots (subset of `shots`), for the morning review. */
  mine: ShotView[];
  /** Per-author counts of shots that will be in the album, visible as numbers only (the teaser). */
  counts: { userId: string; count: number }[];
  /** Total shots that will be released (not discarded/deleted), across everyone. */
  total: number;
}

const countable = (s: ShotFacts) => s.status === "held" || s.status === "kept";

export function assembleAlbum(input: AlbumInput): Album {
  const { viewerId, phase, shots, blocks } = input;
  const isParticipant = input.participantIds.includes(viewerId);
  const ctx: ViewerContext = { viewerId, isParticipant, phase, blocks };

  const visible = shots
    .filter((s) => canSeeShot(s, ctx))
    .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime() || a.id.localeCompare(b.id))
    .map<ShotView>((s) => ({
      id: s.id,
      authorId: s.authorId,
      takenAt: s.takenAt,
      mine: s.authorId === viewerId,
      hiddenFromOthers: s.authorId === viewerId && (s.hiddenBy.length > 0 || !!s.subjectHidden),
      discarded: s.status === "discarded",
    }));

  // Counts are a teaser, not a leak: they're shown only to participants, exclude blocked authors
  // (mutual invisibility covers existence too), and count only shots that will be released.
  const byAuthor = new Map<string, number>();
  if (isParticipant) {
    for (const s of shots) {
      if (!countable(s)) continue;
      if (blockedEitherWay(blocks, viewerId, s.authorId)) continue;
      byAuthor.set(s.authorId, (byAuthor.get(s.authorId) ?? 0) + 1);
    }
  }
  const counts = input.participantIds
    .filter((id) => !blockedEitherWay(blocks, viewerId, id))
    .map((userId) => ({ userId, count: byAuthor.get(userId) ?? 0 }));

  return {
    phase,
    shots: visible,
    mine: visible.filter((s) => s.mine),
    counts,
    total: counts.reduce((n, c) => n + c.count, 0),
  };
}
