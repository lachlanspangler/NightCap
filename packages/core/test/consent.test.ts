import { describe, expect, it } from "vitest";
import {
  AUTO_HIDE_REASONS,
  canHide,
  canSeeTag,
  canUnhide,
  createTag,
  REPORT_LABELS,
  REPORT_REASONS,
  respondToTag,
  type Tag,
} from "../src/consent";

const base = { taggerIsParticipant: true, subjectIsParticipant: true, blockedEitherWay: false };

describe("tags", () => {
  it("tagging someone else starts pending", () => {
    expect(createTag({ ...base, taggerId: "maya", subjectId: "theo" })).toEqual({
      ok: true,
      value: "pending",
    });
  });
  it("self-tag is approved immediately", () => {
    expect(createTag({ ...base, taggerId: "theo", subjectId: "theo" })).toEqual({
      ok: true,
      value: "approved",
    });
  });
  it("only participants can tag, and only participants can be tagged", () => {
    expect(
      createTag({ ...base, taggerIsParticipant: false, taggerId: "sam", subjectId: "theo" }),
    ).toMatchObject({ error: "not_participant" });
    expect(
      createTag({ ...base, subjectIsParticipant: false, taggerId: "maya", subjectId: "sam" }),
    ).toMatchObject({ error: "subject_not_participant" });
  });
  it("blocked pairs can't tag each other", () => {
    expect(createTag({ ...base, blockedEitherWay: true, taggerId: "maya", subjectId: "theo" })).toMatchObject(
      { error: "blocked" },
    );
  });
  it("no duplicate tags, and no re-tagging after the subject removed it", () => {
    const t: Tag = { shotId: "s", subjectId: "theo", taggerId: "maya", status: "pending" };
    expect(createTag({ ...base, taggerId: "jules", subjectId: "theo", existing: t })).toMatchObject({
      error: "already_tagged",
    });
    expect(
      createTag({ ...base, taggerId: "jules", subjectId: "theo", existing: { ...t, status: "removed" } }),
    ).toMatchObject({ error: "subject_removed" });
  });
  it("only the subject responds", () => {
    const t: Tag = { shotId: "s", subjectId: "theo", taggerId: "maya", status: "pending" };
    expect(respondToTag(t, "maya", "approve")).toMatchObject({ error: "not_subject" });
    expect(respondToTag(t, "theo", "approve")).toEqual({ ok: true, value: "approved" });
    expect(respondToTag(t, "theo", "remove")).toEqual({ ok: true, value: "removed" });
    expect(respondToTag({ ...t, status: "removed" }, "theo", "approve")).toMatchObject({
      error: "already_removed",
    });
  });
  it("pending tags are visible only to subject and tagger", () => {
    const t: Tag = { shotId: "s", subjectId: "theo", taggerId: "maya", status: "pending" };
    expect(canSeeTag(t, "theo", true)).toBe(true);
    expect(canSeeTag(t, "maya", true)).toBe(true);
    expect(canSeeTag(t, "jules", true)).toBe(false);
    expect(canSeeTag({ ...t, status: "approved" }, "jules", true)).toBe(true);
    expect(canSeeTag({ ...t, status: "approved" }, "jules", false)).toBe(false);
    expect(canSeeTag({ ...t, status: "removed" }, "theo", true)).toBe(true);
    expect(canSeeTag({ ...t, status: "removed" }, "maya", true)).toBe(false);
  });
});

describe("hide-me", () => {
  it("any participant except the author can hide", () => {
    expect(
      canHide({ actorId: "theo", authorId: "maya", isParticipant: true, alreadyHiddenByActor: false }),
    ).toMatchObject({ ok: true });
    expect(
      canHide({ actorId: "maya", authorId: "maya", isParticipant: true, alreadyHiddenByActor: false }),
    ).toMatchObject({ error: "author_should_delete" });
    expect(
      canHide({ actorId: "sam", authorId: "maya", isParticipant: false, alreadyHiddenByActor: false }),
    ).toMatchObject({ error: "not_participant" });
    expect(
      canHide({ actorId: "theo", authorId: "maya", isParticipant: true, alreadyHiddenByActor: true }),
    ).toMatchObject({ error: "already_hidden" });
  });
  it("only the hider can un-hide (not the author)", () => {
    expect(canUnhide("theo", "theo")).toBe(true);
    expect(canUnhide("theo", "maya")).toBe(false);
  });
});

describe("reports", () => {
  it("every reason has a label, subject-categories auto-hide", () => {
    for (const r of REPORT_REASONS) expect(REPORT_LABELS[r]).toBeTruthy();
    expect([...AUTO_HIDE_REASONS].sort()).toEqual(["in_photo", "nudity", "under_18", "under_21"]);
  });
});
