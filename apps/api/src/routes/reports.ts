// Reporting a person (not a photo): City Night tablemates, crew or night members (privacy review M3).
import { USER_REPORT_REASONS } from "@nightcap/core";
import { asUser } from "@nightcap/db";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../deps";
import { body } from "../http";

export const reports = new Hono<AppEnv>();

reports.post("/", async (c) => {
  const deps = c.get("deps");
  const p = await body(
    c,
    z.object({
      userId: z.string().uuid(),
      reason: z.enum(USER_REPORT_REASONS),
      note: z.string().max(500).optional(),
      eventId: z.string().uuid().optional(),
      nightId: z.string().uuid().optional(),
    }),
  );
  await asUser(deps.db, c.get("userId"), (tx) =>
    tx.query(`select report_user($1, $2, $3, $4, $5, $6)`, [
      p.userId,
      p.reason,
      p.note ?? null,
      p.eventId ?? null,
      p.nightId ?? null,
      deps.clock.now(),
    ]),
  );
  return c.json({ ok: true, message: "Thanks. We'll look into it. You can also block them." }, 201);
});
