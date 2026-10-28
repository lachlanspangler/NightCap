import { parseInviteInput } from "@nightcap/core";
import { asUser } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps";
import { body, fail } from "../http";
import { sha256 } from "../services/util";

export const invites = new Hono<AppEnv>();

invites.post("/redeem", async (c) => {
  const deps = c.get("deps");
  const { token: input } = await body(c, z.object({ token: z.string().max(200) }));
  const token = parseInviteInput(input);
  if (!token) fail(404, "invalid_invite");
  const r = await asUser(
    deps.db,
    c.get("userId"),
    async (tx) =>
      (
        await tx.query<{ r: { kind: "crew" | "night"; crew_id?: string; night_id?: string } }>(
          `select redeem_invite($1, $2) as r`,
          [sha256(token!), deps.clock.now()],
        )
      ).rows[0]!.r,
  );
  return c.json({ kind: r.kind, crewId: r.crew_id ?? null, nightId: r.night_id ?? null });
});

/** Turn a link off (privacy review H2). Only its creator can. */
invites.post("/:id/revoke", async (c) => {
  const deps = c.get("deps");
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/.test(id)) fail(404, "not_found");
  await asUser(deps.db, c.get("userId"), (tx) =>
    tx.query(`select revoke_invite($1, $2)`, [id, deps.clock.now()]),
  );
  return c.json({ ok: true });
});
