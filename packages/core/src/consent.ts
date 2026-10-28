// Consent for people in photos (ADR 0004, PRIVACY_SAFETY.md).
import { err, ok, type Result } from "./result";

export type TagStatus = "pending" | "approved" | "removed";

export interface Tag {
  shotId: string;
  subjectId: string;
  taggerId: string;
  status: TagStatus;
}

export type TagError = "not_participant" | "subject_not_participant" | "blocked" | "already_tagged";

/** Anyone in the night can tag another participant. A self-tag ("that's me") is approved immediately. */
export function createTag(input: {
  taggerId: string;
  subjectId: string;
  taggerIsParticipant: boolean;
  subjectIsParticipant: boolean;
  blockedEitherWay: boolean;
  existing?: Tag | undefined;
}): Result<TagStatus, TagError> {
  if (!input.taggerIsParticipant) return err("not_participant");
  if (!input.subjectIsParticipant) return err("subject_not_participant");
  if (input.blockedEitherWay) return err("blocked");
  if (input.existing && input.existing.status !== "removed") return err("already_tagged");
  return ok(input.taggerId === input.subjectId ? "approved" : "pending");
}

export type TagResponseError = "not_subject" | "already_removed";

/** Only the subject decides about their own tag. */
export function respondToTag(
  tag: Tag,
  actorId: string,
  action: "approve" | "remove",
): Result<TagStatus, TagResponseError> {
  if (tag.subjectId !== actorId) return err("not_subject");
  if (tag.status === "removed") return err("already_removed");
  return ok(action === "approve" ? "approved" : "removed");
}

/** Pending tags are visible only to the subject and the tagger: a pending tag never widens visibility. */
export function canSeeTag(tag: Tag, viewerId: string, viewerCanSeeShot: boolean): boolean {
  if (tag.status === "removed") return false;
  if (tag.status === "pending") return viewerId === tag.subjectId || viewerId === tag.taggerId;
  return viewerCanSeeShot;
}

export type HideError = "not_participant" | "author_should_delete" | "already_hidden";

/**
 * Any participant may hide a shot they're in ("that's me, hide it"). We don't ask them to prove it's
 * them: a false hide only removes content (the safe failure). The author deletes or discards instead.
 */
export function canHide(input: {
  actorId: string;
  authorId: string;
  isParticipant: boolean;
  alreadyHiddenByActor: boolean;
}): Result<undefined, HideError> {
  if (!input.isParticipant) return err("not_participant");
  if (input.actorId === input.authorId) return err("author_should_delete");
  if (input.alreadyHiddenByActor) return err("already_hidden");
  return ok();
}

/** Only the person who hid it can lift their own hide. The author can't un-hide. */
export function canUnhide(hiderId: string, actorId: string): boolean {
  return hiderId === actorId;
}

export const REPORT_REASONS = ["in_photo", "nudity", "minor", "harassment", "violence", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Subject-category reports hide the shot for everyone (pending review), not just the reporter. */
export const AUTO_HIDE_REASONS: ReadonlySet<ReportReason> = new Set<ReportReason>([
  "in_photo",
  "nudity",
  "minor",
]);

export const REPORT_LABELS: Record<ReportReason, string> = {
  in_photo: "I'm in this and don't want it shared",
  nudity: "Nudity or sexual content",
  minor: "Someone in it is under 21",
  harassment: "Harassment or bullying",
  violence: "Violence or danger",
  other: "Something else",
};
