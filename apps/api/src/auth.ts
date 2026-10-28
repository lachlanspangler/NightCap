import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./deps";
import { fail } from "./http";
import { signJwt, verifyJwt } from "./jwt";

/** Requires a valid Bearer token; sets userId. There are no anonymous routes except /health and /media (signed). */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const deps = c.get("deps");
  const authz = c.req.header("Authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  const claims = token
    ? verifyJwt(token, deps.config.jwtSecret, Math.floor(deps.clock.now().getTime() / 1000))
    : null;
  if (!claims) fail(401, "auth_required", "Sign in to continue.");
  c.set("userId", claims!.sub);
  await next();
};

export function mintToken(
  deps: { config: { jwtSecret: string; mode: string }; clock: { now(): Date } },
  userId: string,
): string {
  return signJwt(
    { sub: userId, role: "authenticated", dev: deps.config.mode === "mock" },
    deps.config.jwtSecret,
    Math.floor(deps.clock.now().getTime() / 1000),
  );
}
