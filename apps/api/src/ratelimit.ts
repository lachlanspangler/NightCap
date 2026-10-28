// Per-account token bucket for writes (and per-IP for everything). In-memory: fine for one API process.
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "./deps";

export function rateLimit(opts: { capacity: number; refillPerSec: number; key: (c: Context<AppEnv>) => string | null; name: string }): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return async (c, next) => {
    const k = opts.key(c);
    if (k === null) return next();
    const now = c.get("deps").clock.now().getTime();
    const b = buckets.get(k) ?? { tokens: opts.capacity, at: now };
    b.tokens = Math.min(opts.capacity, b.tokens + ((now - b.at) / 1000) * opts.refillPerSec);
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(k, b);
      return c.json({ error: "rate_limited", message: "Slow down a little. Try again in a moment." }, 429);
    }
    b.tokens -= 1;
    buckets.set(k, b);
    if (buckets.size > 10_000) buckets.clear();
    return next();
  };
}
