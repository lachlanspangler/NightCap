// The Hono app. createApp(deps) is separate from index.ts so tests use app.request() in-process.
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { requireUser } from "./auth";
import type { AppEnv, Deps } from "./deps";
import { errorResponse } from "./http";
import { rateLimit } from "./ratelimit";
import { city } from "./routes/city";
import { crews } from "./routes/crews";
import { dev } from "./routes/dev";
import { invites } from "./routes/invites";
import { me } from "./routes/me";
import { media } from "./routes/media";
import { nights } from "./routes/nights";
import { blocks } from "./routes/safety";
import { reports } from "./routes/reports";
import { shots } from "./routes/shots";

/**
 * The per-IP bucket key (code review R2-1). Behind our own proxy (TRUST_PROXY=1) the client IP is
 * the *rightmost* X-Forwarded-For entry (the one our proxy appended; everything left of it is
 * client-controlled). Otherwise it's the socket's remote address.
 */
export function clientKey(c: Context<AppEnv>): string {
  if (process.env.TRUST_PROXY === "1") {
    const hops = (c.req.header("x-forwarded-for") ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "in-process"; // app.request() in tests has no socket
  }
}

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    const t0 = Date.now();
    await next();
    if (c.req.path !== "/health")
      deps.log?.(`${c.req.method} ${c.req.path} → ${c.res.status} ${Date.now() - t0}ms`);
  });
  app.onError((e, c) => errorResponse(c, e, deps.log));
  app.notFound((c) => c.json({ error: "not_found", message: "Nothing here." }, 404));

  app.use(
    "*",
    rateLimit({
      name: "ip",
      capacity: 300,
      refillPerSec: 5,
      key: clientKey,
    }),
  );

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "nightcap-api",
      mode: deps.config.mode,
      now: deps.clock.now().toISOString(),
    }),
  );
  app.route("/media", media);
  if (deps.config.mode === "mock") {
    // Login/signup are unauthenticated; the rest of /dev needs a user.
    app.use("/dev/nights/*", requireUser);
    app.route("/dev", dev);
  }

  const authed = new Hono<AppEnv>();
  authed.use("*", requireUser);
  const writes = rateLimit({
    name: "acct",
    capacity: 60,
    refillPerSec: 1,
    key: (c) => (c.req.method === "GET" ? null : (c.get("userId") ?? null)),
  });
  authed.use("*", writes);
  authed.route("/me", me);
  authed.route("/crews", crews);
  authed.route("/nights", nights);
  authed.route("/shots", shots);
  authed.route("/blocks", blocks);
  authed.route("/invites", invites);
  authed.route("/city", city);
  authed.route("/reports", reports);
  app.route("/", authed);
  return app;
}
