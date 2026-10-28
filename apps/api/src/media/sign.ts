// Signed, short-lived media URLs bound to (shot, viewer, expiry) (ADR 0006).
import { createHmac, timingSafeEqual } from "node:crypto";

export const MEDIA_URL_TTL_SEC = 10 * 60;

function mac(secret: string, shotId: string, viewerId: string, exp: number) {
  return createHmac("sha256", secret).update(`${shotId}|${viewerId}|${exp}`).digest("base64url");
}

export function signMediaPath(
  secret: string,
  shotId: string,
  viewerId: string,
  nowSec: number,
  ttl = MEDIA_URL_TTL_SEC,
): string {
  // Round expiry up to the minute so URLs are stable within a minute (image caches stay warm).
  const exp = Math.ceil((nowSec + ttl) / 60) * 60;
  return `/media/${shotId}?v=${viewerId}&exp=${exp}&sig=${mac(secret, shotId, viewerId, exp)}`;
}

export function verifyMediaSig(
  secret: string,
  shotId: string,
  viewerId: string,
  exp: number,
  sig: string,
  nowSec: number,
): boolean {
  if (!Number.isFinite(exp) || exp <= nowSec) return false;
  const want = Buffer.from(mac(secret, shotId, viewerId, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}
