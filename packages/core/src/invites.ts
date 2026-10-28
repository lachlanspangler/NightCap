// Join codes, invite tokens, invite lifecycle (PRIVACY_SAFETY T4/T9).
import { DAY, MINUTE } from "./time";
import { err, ok, type Result } from "./result";

export const NIGHT_CODE_LENGTH = 4;
export const CREW_INVITE_TTL_MS = 7 * DAY;
export const INVITE_TOKEN_BYTES = 16; // 128-bit
export const CODE_ATTEMPTS = { max: 10, windowMs: 10 * MINUTE } as const;

/** A 4-digit code for a live night from an injected uniform [0,1) source. Leading zeros allowed. */
export function generateNightCode(rand: () => number): string {
  let s = "";
  for (let i = 0; i < NIGHT_CODE_LENGTH; i++) s += String(Math.floor(rand() * 10) % 10);
  return s;
}

/** Forgiving input: "12 34", "1-2-3-4", " 1234 " all → "1234". Anything else → null. */
export function normalizeCode(input: string): string | null {
  const digits = (input ?? "").replace(/[\s\-–—.]/g, "");
  return new RegExp(`^\\d{${NIGHT_CODE_LENGTH}}$`).test(digits) ? digits : null;
}

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url without padding. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]! + B64URL[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]!;
  }
  return out;
}

export function inviteTokenFromBytes(bytes: Uint8Array): string {
  if (bytes.length < INVITE_TOKEN_BYTES) throw new Error("invite tokens need ≥128 bits");
  return toBase64Url(bytes);
}

export function isInviteTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{22,64}$/.test(token);
}

export type InviteKind = "crew" | "night";

export interface Invite {
  kind: InviteKind;
  expiresAt: Date;
  revokedAt: Date | null;
  maxUses: number | null;
  uses: number;
}

export type InviteError = "expired" | "revoked" | "used_up";

export function inviteStatus(invite: Invite, now: Date): Result<undefined, InviteError> {
  if (invite.revokedAt && invite.revokedAt <= now) return err("revoked");
  if (now >= invite.expiresAt) return err("expired");
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return err("used_up");
  return ok();
}

/** Night invites die with the night's live phase; crew invites last 7 days. */
export function inviteExpiry(kind: InviteKind, now: Date, nightEndsAt?: Date): Date {
  if (kind === "night") {
    if (!nightEndsAt) throw new Error("night invites need the night's end");
    return nightEndsAt;
  }
  return new Date(now.getTime() + CREW_INVITE_TTL_MS);
}

/** Sliding-window limit on code guesses per account (10 per 10 min): 10,000 codes can't be walked. */
export function codeAttemptAllowed(previousAttempts: readonly Date[], now: Date): boolean {
  const since = now.getTime() - CODE_ATTEMPTS.windowMs;
  return previousAttempts.filter((t) => t.getTime() > since).length < CODE_ATTEMPTS.max;
}

export const APP_SCHEME = "nightcap";
export const WEB_HOST = "nightcap.app"; // placeholder domain (not owned yet; STATUS → Needs from you)

export function inviteLinks(token: string) {
  return {
    app: `${APP_SCHEME}://join/${token}`,
    web: `https://${WEB_HOST}/j/${token}`,
  };
}

/** Parses a scanned QR / pasted link / raw token back to a token. */
export function parseInviteInput(input: string): string | null {
  const s = (input ?? "").trim();
  const m =
    s.match(/(?:nightcap:\/\/join\/|nightcap\.app\/j\/)([A-Za-z0-9_-]+)/) ?? s.match(/^([A-Za-z0-9_-]+)$/);
  const token = m?.[1];
  return token && isInviteTokenShape(token) ? token : null;
}
