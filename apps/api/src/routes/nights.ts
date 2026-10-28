import { createHash } from "node:crypto";
import {
  canMarkReady,
  canShoot,
  generateNightCode,
  inviteExpiry,
  inviteLinks,
  inviteTokenFromBytes,
  INVITE_TOKEN_BYTES,
  normalizeCode,
  phaseOf,
} from "@nightcap/core";
import { asService, asUser, dbErrorCode } from "@nightcap/db";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AppEnv, Deps } from "../deps";
import { body, fail, param } from "../http";
import { imageSize, ImageError, stripMetadata } from "../media/exif";
import { advance, nightView, toState, type NightRow } from "../services/nights";
import { liveNightOf, sha256 } from "../services/util";

export const nights = new Hono<AppEnv>();

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

nights.get("/current", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const live = await liveNightOf(deps, userId);
  if (live) await advance(deps, live.id);
  const still = live ? await liveNightOf(deps, userId) : null;
  return c.json({ night: still ? await nightView(deps, userId, still.id) : null });
});

nights.get("/:id", async (c) => {
  const deps = c.get("deps");
  const night = await nightView(deps, c.get("userId"), param(c, "id"));
  if (!night) fail(404, "not_found");
  return c.json({ night });
});

nights.post("/join", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const { code } = await body(c, z.object({ code: z.string().max(20) }));
  const normal = normalizeCode(code);
  if (!normal) fail(422, "invalid", "Night codes are 4 digits.");
  // Checked before the code is looked at, so this answer says nothing about the code (review #4).
  const current = await liveNightOf(deps, userId);
  if (current) {
    // Re-scanning your own night's code just takes you back to it (review R2-2); any other code
    // gets "you're already out", which still says nothing about that code.
    const own = await asUser(
      deps.db,
      userId,
      async (tx) =>
        (
          await tx.query<{ join_code: string | null }>(`select join_code from nights where id = $1`, [
            current.id,
          ])
        ).rows[0]?.join_code,
    );
    if (own === normal) return c.json({ night: await nightView(deps, userId, current.id) });
    fail(409, "already_in_live_night");
  }
  const id = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (
        await tx.query<{ id: string | null }>(`select join_night_by_code($1, $2) as id`, [
          normal,
          deps.clock.now(),
        ])
      ).rows[0]?.id ?? null,
  );
  if (!id) fail(404, "unavailable");
  return c.json({ night: await nightView(deps, userId, id!) });
});

nights.post("/:id/join", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  await advance(deps, id);
  await asUser(deps.db, userId, (tx) => tx.query(`select join_crew_night($1, $2)`, [id, deps.clock.now()]));
  return c.json({ night: await nightView(deps, userId, id) });
});

nights.post("/:id/invites", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  await advance(deps, id);
  const n = await asUser(
    deps.db,
    userId,
    async (tx) => (await tx.query<NightRow>(`select * from nights where id = $1`, [id])).rows[0],
  );
  if (!n) fail(404, "not_found");
  const token = inviteTokenFromBytes(deps.random.bytes(INVITE_TOKEN_BYTES));
  const now = deps.clock.now();
  const expiresAt = inviteExpiry("night", now, n!.auto_end_at);
  const inviteId = await asUser(
    deps.db,
    userId,
    async (tx) =>
      (
        await tx.query<{ id: string }>(`select create_invite('night', $1, $2, $3, 10, $4) as id`, [
          id,
          sha256(token),
          expiresAt,
          now,
        ])
      ).rows[0]!.id,
  );
  return c.json(
    {
      id: inviteId,
      token,
      links: inviteLinks(token),
      code: n!.join_code,
      maxUses: 10,
      expiresAt: expiresAt.toISOString(),
    },
    201,
  );
});

/** Hosts remove anyone, instantly: a safety action, never deferred (privacy review C1). */
nights.delete("/:id/members/:userId", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  const target = param(c, "userId");
  await asUser(deps.db, userId, (tx) =>
    tx.query(`select remove_from_night($1, $2, $3)`, [id, target, deps.clock.now()]),
  );
  return c.json({ night: await nightView(deps, userId, id) });
});

/** New code + every night link revoked (H2): for when the code got around. */
nights.post("/:id/code/rotate", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  let done = false;
  for (let attempt = 0; attempt < 40 && !done; attempt++) {
    try {
      await asUser(deps.db, userId, (tx) =>
        tx.query(`select rotate_night_code($1, $2, $3)`, [
          id,
          generateNightCode(deps.random.float),
          deps.clock.now(),
        ]),
      );
      done = true;
    } catch (e) {
      if (dbErrorCode(e) !== "conflict") throw e;
    }
  }
  if (!done) fail(503, "busy", "Couldn't find a free code. Try again.");
  return c.json({ night: await nightView(deps, userId, id) });
});

nights.post("/:id/end", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  await asUser(deps.db, userId, (tx) => tx.query(`select end_night($1, $2)`, [id, deps.clock.now()]));
  return c.json({ night: await nightView(deps, userId, id) });
});

nights.post("/:id/ready", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const id = param(c, "id");
  await advance(deps, id);
  const n = await asUser(
    deps.db,
    userId,
    async (tx) => (await tx.query<NightRow>(`select * from nights where id = $1`, [id])).rows[0],
  );
  if (!n) fail(404, "not_found");
  const ok = canMarkReady(toState(n!), deps.clock.now());
  if (!ok.ok)
    fail(
      ok.error === "too_early" ? 425 : 409,
      ok.error,
      undefined,
      ok.countsFrom ? { countsFrom: ok.countsFrom.toISOString() } : undefined,
    );
  await asUser(deps.db, userId, (tx) => tx.query(`select mark_ready($1, $2)`, [id, deps.clock.now()]));
  await advance(deps, id); // this may be the last "I'm good" → early reveal
  return c.json({ night: await nightView(deps, userId, id) });
});

/** Upload a shot (multipart field "photo"). Metadata is stripped before anything is stored. */
export async function takeShot(deps: Deps, userId: string, nightId: string, raw: Uint8Array) {
  await advance(deps, nightId);
  const n = await asUser(
    deps.db,
    userId,
    async (tx) => (await tx.query<NightRow>(`select * from nights where id = $1`, [nightId])).rows[0],
  );
  if (!n) fail(404, "not_found");
  const facts = await asUser(deps.db, userId, async (tx) => {
    const r = await tx.query<{ participant: boolean; taken: number }>(
      `select is_participant($1) as participant, (select count(*)::int from shots where night_id = $1 and author_id = $2) as taken`,
      [nightId, userId],
    );
    return r.rows[0]!;
  });
  const can = canShoot({
    isParticipant: facts.participant,
    phase: phaseOf({ endedAt: n!.ended_at, unlockedAt: n!.unlocked_at }),
    shotsTaken: facts.taken,
    rollSize: n!.roll_size,
  });
  if (!can.ok) fail(can.error === "not_member" ? 403 : 409, can.error);
  let clean: { bytes: Uint8Array; mime: "image/jpeg" | "image/png" };
  try {
    clean = stripMetadata(raw);
  } catch (e) {
    if (e instanceof ImageError) fail(415, "unsupported_media", "Photos must be JPEG or PNG.");
    throw e;
  }
  const size = imageSize(clean!.bytes, clean!.mime);
  // Media already reported as nudity / under-18 can't be shared again (exact-hash denylist;
  // perceptual hashing / PhotoDNA / StopNCII is a production TODO).
  const contentHash = createHash("sha256").update(clean!.bytes).digest("hex");
  const denied = await asService(
    deps.db,
    async (tx) =>
      (await tx.query(`select 1 from blocked_hashes where content_hash = $1`, [contentHash])).rows.length > 0,
  );
  if (denied) fail(422, "blocked_media", "This photo can't be shared on NightCap.");
  const id = deps.random.uuid();
  const key = `shots/${nightId}/${id}.${clean!.mime === "image/png" ? "png" : "jpg"}`;
  await deps.media.put(key, clean!.bytes, clean!.mime);
  try {
    await asUser(deps.db, userId, (tx) =>
      tx.query(
        `insert into shots (id, night_id, author_id, media_key, mime, width, height, bytes, taken_at, content_hash) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          id,
          nightId,
          userId,
          key,
          clean!.mime,
          size?.width ?? null,
          size?.height ?? null,
          clean!.bytes.length,
          deps.clock.now(),
          contentHash,
        ],
      ),
    );
  } catch (e) {
    await deps.media.delete(key).catch(() => undefined);
    throw e;
  }
  if (n!.kind === "moment") await advance(deps, nightId); // last one in → reveal
  return { id, shotsLeft: can.ok ? can.value : 0 };
}

// Reject oversized uploads while streaming, before buffering them (code review #13).
nights.use(
  "/:id/shots",
  bodyLimit({
    maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
    onError: (c) => c.json({ error: "too_large", message: "That photo is too big (12 MB max)." }, 413),
  }),
);

nights.post("/:id/shots", async (c) => {
  const deps = c.get("deps");
  const userId = c.get("userId");
  const nightId = param(c, "id");
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) fail(413, "too_large", "That photo is too big (12 MB max).");
  let file: File | null = null;
  try {
    const form = await c.req.formData();
    const f = form.get("photo");
    file = f instanceof File ? f : null;
  } catch {
    fail(422, "invalid", "Send the photo as multipart field 'photo'.");
  }
  if (!file) fail(422, "invalid", "Send the photo as multipart field 'photo'.");
  if (file!.size > MAX_UPLOAD_BYTES) fail(413, "too_large", "That photo is too big (12 MB max).");
  const raw = new Uint8Array(await file!.arrayBuffer());
  const shot = await takeShot(deps, userId, nightId, raw);
  return c.json({ shot }, 201);
});
