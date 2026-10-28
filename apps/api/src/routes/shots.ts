import { canReviewShot, createTag, isReaction, phaseOf, REPORT_REASONS, respondToTag } from "@nightcap/core";
import { asUser, type Queryable } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps";
import { body, fail, param } from "../http";
import { advance } from "../services/nights";

export const shots = new Hono<AppEnv>();

async function shotFacts(tx: Queryable, shotId: string) {
  const r = await tx.query<{ id: string; night_id: string; author_id: string; status: string; ended_at: Date | null; unlocked_at: Date | null; media_key: string }>(
    `select s.id, s.night_id, s.author_id, s.status, n.ended_at, n.unlocked_at, s.media_key from shots s join nights n on n.id = s.night_id where s.id = $1`,
    [shotId],
  );
  return r.rows[0] ?? null;
}

/** Morning review: keep or toss your own shot before the unlock. */
shots.patch("/:id", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const { status } = await body(c, z.object({ status: z.enum(["kept", "discarded"]) }));
  const pre = await asUser(deps.db, userId, (tx) => shotFacts(tx, id));
  if (!pre) fail(404, "not_found");
  await advance(deps, pre!.night_id);
  await asUser(deps.db, userId, async (tx) => {
    const s = await shotFacts(tx, id);
    const ok = canReviewShot({ actorId: userId, authorId: s!.author_id, phase: phaseOf({ endedAt: s!.ended_at, unlockedAt: s!.unlocked_at }) });
    if (!ok.ok) fail(ok.error === "not_author" ? 403 : 409, ok.error, ok.error === "already_unlocked" ? "It's developed already. You can still delete it." : undefined);
    await tx.query(`update shots set status = $2, reviewed_at = $3 where id = $1`, [id, status, deps.clock.now()]);
  });
  return c.json({ ok: true, status });
});

shots.delete("/:id", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const key = await asUser(deps.db, userId, async (tx) => {
    const s = await shotFacts(tx, id);
    if (!s || s.author_id !== userId) fail(404, "not_found");
    await tx.query(`update shots set status = 'deleted' where id = $1`, [id]);
    return s!.media_key;
  });
  await deps.media.delete(key).catch(() => undefined);
  return c.json({ ok: true });
});

/** "That's me, hide it." */
shots.post("/:id/hide", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  await asUser(deps.db, userId, async (tx) => {
    const s = await shotFacts(tx, id);
    if (!s) fail(404, "not_found");
    if (s!.author_id === userId) fail(409, "author_should_delete", "It's your photo: delete it instead.");
    await tx.query(`insert into shot_hides (shot_id, user_id, created_at) values ($1, $2, $3) on conflict do nothing`, [id, userId, deps.clock.now()]);
  });
  return c.json({ ok: true, hidden: true });
});

shots.delete("/:id/hide", async (c) => {
  const deps = c.get("deps");
  await asUser(deps.db, c.get("userId"), (tx) => tx.query(`delete from shot_hides where shot_id = $1 and user_id = $2 and reason = 'me'`, [param(c, "id"), c.get("userId")]));
  return c.json({ ok: true, hidden: false });
});

shots.post("/:id/tags", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const { userId: subjectId } = await body(c, z.object({ userId: z.string().uuid() }));
  await asUser(deps.db, userId, async (tx) => {
    const s = await shotFacts(tx, id);
    if (!s) fail(404, "not_found");
    const facts = (
      await tx.query<{ tagger: boolean; subject: boolean; blocked: boolean; existing: string | null }>(
        `select is_participant($1) as tagger,
                exists (select 1 from night_members where night_id = $1 and user_id = $2) as subject,
                blocked_either($3, $2) as blocked,
                (select status from shot_tags where shot_id = $4 and subject_id = $2) as existing`,
        [s!.night_id, subjectId, userId, id],
      )
    ).rows[0]!;
    const r = createTag({
      taggerId: userId,
      subjectId,
      taggerIsParticipant: facts.tagger,
      subjectIsParticipant: facts.subject,
      blockedEitherWay: facts.blocked,
      existing: facts.existing ? { shotId: id, subjectId, taggerId: userId, status: facts.existing as "pending" } : undefined,
    });
    if (!r.ok) fail(r.error === "already_tagged" || r.error === "subject_removed" ? 409 : 403, r.error);
    await tx.query(`insert into shot_tags (shot_id, subject_id, tagger_id, status, created_at, updated_at) values ($1, $2, $3, $4, $5, $5)`, [id, subjectId, userId, r.ok ? r.value : "pending", deps.clock.now()]);
  });
  return c.json({ ok: true }, 201);
});

/** The subject answers: keep the tag, or untag. */
shots.patch("/:id/tags/me", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const { status } = await body(c, z.object({ status: z.enum(["approved", "removed"]) }));
  await asUser(deps.db, userId, async (tx) => {
    const t = (await tx.query<{ status: string; tagger_id: string }>(`select status, tagger_id from shot_tags where shot_id = $1 and subject_id = $2`, [id, userId])).rows[0];
    if (!t) fail(404, "not_found");
    const r = respondToTag({ shotId: id, subjectId: userId, taggerId: t!.tagger_id, status: t!.status as "pending" }, userId, status === "approved" ? "approve" : "remove");
    if (!r.ok) fail(409, r.error);
    await tx.query(`update shot_tags set status = $3, updated_at = $4 where shot_id = $1 and subject_id = $2`, [id, userId, status, deps.clock.now()]);
  });
  return c.json({ ok: true, status });
});

shots.put("/:id/reaction", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const { emoji } = await body(c, z.object({ emoji: z.string() }));
  if (!isReaction(emoji)) fail(422, "invalid", "Pick one of the five reactions.");
  await asUser(deps.db, userId, (tx) =>
    tx.query(`insert into reactions (shot_id, user_id, emoji, created_at) values ($1, $2, $3, $4) on conflict (shot_id, user_id) do update set emoji = excluded.emoji`, [id, userId, emoji, deps.clock.now()]),
  );
  return c.json({ ok: true, emoji });
});

shots.delete("/:id/reaction", async (c) => {
  const deps = c.get("deps");
  await asUser(deps.db, c.get("userId"), (tx) => tx.query(`delete from reactions where shot_id = $1 and user_id = $2`, [param(c, "id"), c.get("userId")]));
  return c.json({ ok: true });
});

shots.post("/:id/report", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const p = await body(c, z.object({ reason: z.enum(REPORT_REASONS), note: z.string().max(500).optional() }));
  await asUser(deps.db, userId, (tx) => tx.query(`select report_shot($1, $2, $3, $4)`, [id, p.reason, p.note ?? null, deps.clock.now()]));
  return c.json({ ok: true, hidden: ["in_photo", "nudity", "minor"].includes(p.reason) }, 201);
});
