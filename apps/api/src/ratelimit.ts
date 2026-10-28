// Per-account token bucket for writes (and per-IP for everything). In-memory: fine for one API process.
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "./deps";

export function rateLimit(opts: {
  capacity: number;
  refillPerSec: number;
  key: (c: Context<AppEnv>) => string | null;
  name: string;
}): MiddlewareHandler<AppEnv> {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return async (c, next) => {
    const k = opts.key(c);
    if (k === null) return next();
    const now = c.get("deps").clock.now().getTime();
    const b = buckets.get(k) ?? { tokens: opts.capacity, at: now };
    // Clamp: dev time travel can move the clock backwards; that must never drain the bucket.
    const elapsed = Math.max(0, now - b.at);
    b.tokens = Math.max(0, Math.min(opts.capacity, b.tokens + (elapsed / 1000) * opts.refillPerSec));
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(k, b);
      return c.json({ error: "rate_limited", message: "Slow down a little. Try again in a moment." }, 429);
    }
    b.tokens -= 1;
    buckets.set(k, b);
    // Evict the oldest buckets instead of resetting everyone (code review #12).
    if (buckets.size > 10_000) for (const k of [...buckets.keys()].slice(0, 1_000)) buckets.delete(k);
    return next();
  };
}
