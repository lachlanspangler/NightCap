import { asService, asUser } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps";
import { body, fail, param } from "../http";

export const blocks = new Hono<AppEnv>();

blocks.get("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const ids = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (
        await tx.query<{ blocked_id: string; created_at: Date }>(
          `select blocked_id, created_at from blocks order by created_at desc`,
        )
      ).rows,
  );
  // Names of people you blocked (your own list; service read scoped to your rows).
  const names = ids.length
    ? await asService(
        deps.db,
        async (tx) =>
          (
            await tx.query<{ id: string; display_name: string }>(
              `select id, display_name from profiles where id = any($1)`,
              [ids.map((i) => i.blocked_id)],
            )
          ).rows,
      )
    : [];
  return c.json({
    blocks: ids.map((b) => ({
      userId: b.blocked_id,
      name: names.find((n) => n.id === b.blocked_id)?.display_name ?? "Someone",
      since: b.created_at.toISOString(),
    })),
  });
});

/** Blocking is never deferred, even at night (safety beats regret). */
blocks.post("/", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const { userId: target } = await body(c, z.object({ userId: z.string().uuid() }));
  if (target === userId) fail(422, "invalid", "You can't block yourself.");
  await asUser(deps.db, userId, (tx) =>
    tx.query(
      `insert into blocks (blocker_id, blocked_id, created_at) values ($1, $2, $3) on conflict do nothing`,
      [userId, target, deps.clock.now()],
    ),
  );
  return c.json({ ok: true }, 201);
});

blocks.delete("/:userId", async (c) => {
  const deps = c.get("deps");
  await asUser(deps.db, c.get("userId"), (tx) =>
    tx.query(`delete from blocks where blocker_id = $1 and blocked_id = $2`, [
      c.get("userId"),
      param(c, "userId"),
    ]),
  );
  return c.json({ ok: true });
});
