// HS256 JWTs with node:crypto (ADR 0005): one verify path for Supabase (prod) and dev tokens (mock).
import { createHmac, timingSafeEqual } from "node:crypto";

export interface Claims {
  sub: string;
  role: "authenticated";
  iat: number;
  exp: number;
  /** Mock-mode marker so a dev token can never pass in prod (different secret anyway). */
  dev?: boolean;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function signJwt(claims: Omit<Claims, "iat" | "exp">, secret: string, nowSec: number, ttlSec = 30 * 86_400): string {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ ...claims, iat: nowSec, exp: nowSec + ttlSec }));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function verifyJwt(token: string, secret: string, nowSec: number): Claims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts as [string, string, string];
  let header: { alg?: string };
  let claims: Partial<Claims>;
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null; // no "none", no alg confusion
  const expected = createHmac("sha256", secret).update(`${h}.${b}`).digest();
  const given = Buffer.from(s, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (typeof claims.exp !== "number" || claims.exp <= nowSec) return null;
  if (claims.role !== "authenticated" || typeof claims.sub !== "string" || !UUID.test(claims.sub)) return null;
  return claims as Claims;
}
