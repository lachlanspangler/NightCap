import { dbErrorCode } from "@nightcap/db";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message ?? code);
  }
}

export const fail = (status: ContentfulStatusCode, code: string, message?: string, extra?: Record<string, unknown>): never => {
  throw new HttpError(status, code, message, extra);
};

/** Stable error codes from RPCs/RLS → HTTP status. Unknown DB errors are 500s (and logged). */
const STATUS: Record<string, ContentfulStatusCode> = {
  auth_required: 401,
  forbidden: 403,
  not_member: 403,
  not_allowed: 403,
  no_access: 403,
  not_found: 404,
  unavailable: 404,
  invalid_invite: 404,
  conflict: 409,
  crew_has_live_night: 409,
  already_in_live_night: 409,
  not_live: 409,
  not_developing: 409,
  roll_full: 409,
  full: 409,
  crew_full: 409,
  expired: 410,
  revoked: 410,
  used_up: 410,
  invalid: 422,
  bad_schedule: 422,
  bad_kind: 422,
  too_early: 425,
  rate_limited: 429,
};

/** Friendly copy for the app, keyed by code. Short and kind, drunk-proof (DRUNK_UX). */
export const MESSAGES: Record<string, string> = {
  unavailable: "That night isn't available. Check the code?",
  invalid_invite: "That invite doesn't work anymore. Ask for a fresh one.",
  expired: "That invite expired. Ask for a fresh one.",
  revoked: "That invite was turned off.",
  used_up: "That invite's been used up.",
  crew_has_live_night: "There's already a night going. Join that one!",
  already_in_live_night: "You're already in a night. Finish that one first.",
  not_live: "That night's over. It'll develop in the morning.",
  roll_full: "Roll's full. You're in the moment now.",
  too_early: "Tap this when you're up for real (after 7:00 AM).",
  rate_limited: "Too many tries. Take a breather and try again in a few minutes.",
  not_member: "You're not in this crew.",
  no_access: "You need the night's code or a link to join.",
  full: "This night is full.",
  crew_full: "This crew is full (20 max).",
  under_21: "NightCap is for 21+.",
};

export function errorResponse(c: Context, e: unknown, log?: (m: string) => void) {
  if (e instanceof HttpError) {
    return c.json({ error: e.code, message: e.message !== e.code ? e.message : (MESSAGES[e.code] ?? e.code), ...e.extra }, e.status);
  }
  if (e instanceof z.ZodError) {
    return c.json({ error: "invalid", message: "Something in that request wasn't right.", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 422);
  }
  const code = dbErrorCode(e);
  if (code) return c.json({ error: code, message: MESSAGES[code] ?? code }, STATUS[code] ?? 400);
  log?.(`unhandled error: ${(e as Error)?.stack ?? String(e)}`);
  return c.json({ error: "internal", message: "Something went wrong on our side." }, 500);
}

export async function body<T extends z.ZodTypeAny>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown = {};
  try {
    const text = await c.req.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    fail(422, "invalid", "Body must be JSON.");
  }
  return schema.parse(raw);
}

export const uuid = z.string().uuid();
export function param(c: Context, name: string): string {
  const v = c.req.param(name);
  const r = uuid.safeParse(v);
  if (!r.success) fail(404, "not_found");
  return v!;
}
