import { asUser } from "@nightcap/db";
import { Hono } from "hono";
import type { AppEnv } from "../deps";
import { fail, uuid } from "../http";
import { verifyMediaSig } from "../media/sign";

export const media = new Hono<AppEnv>();

/**
 * Signed, short-lived media (ADR 0006). The signature binds (shot, viewer, expiry); we then re-check
 * visibility as that viewer under RLS, so a hide or block takes effect immediately, not in 10 minutes.
 */
media.get("/:shotId", async (c) => {
  const deps = c.get("deps");
  const shotId = c.req.param("shotId");
  const viewer = c.req.query("v") ?? "";
  const exp = Number(c.req.query("exp"));
  const sig = c.req.query("sig") ?? "";
  if (!uuid.safeParse(shotId).success || !uuid.safeParse(viewer).success) fail(404, "not_found");
  if (
    !verifyMediaSig(
      deps.config.mediaSecret,
      shotId,
      viewer,
      exp,
      sig,
      Math.floor(deps.clock.now().getTime() / 1000),
    )
  )
    fail(403, "forbidden");
  const row = await asUser(
    deps.db,
    viewer,
    async (tx) =>
      (
        await tx.query<{ media_key: string; mime: string }>(
          `select media_key, mime from shots where id = $1`,
          [shotId],
        )
      ).rows[0],
  );
  if (!row) fail(404, "not_found");
  const bytes = await deps.media.get(row!.media_key);
  if (!bytes) fail(404, "not_found");
  return new Response(bytes, {
    headers: {
      "content-type": row!.mime,
      // no-store: a hide must take effect on devices that already loaded it (code review #16).
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
});
