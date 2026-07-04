import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Minimal in-process, fixed-window rate limiter.
 *
 * The API is internet-facing on the public demo URL and its expensive route
 * (run-audit) will fan out to paid Vultr inference; without a throttle anyone can
 * loop it and drain the team's credits (CORS only constrains browsers, not curl).
 * This is intentionally dependency-free and per-instance — enough to stop trivial
 * abuse for a single-VM demo. For multi-instance production, front it with a
 * shared store (e.g. @fastify/rate-limit + Redis).
 */
export interface RateLimitOptions {
  /** Window length in ms (default 60s). */
  windowMs?: number;
  /** Max requests allowed per client per window (default 60). */
  max?: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const max = options.max ?? 60;
  const buckets = new Map<string, Bucket>();

  return async function rateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const now = Date.now();
    const key = request.ip;
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
      // Opportunistic sweep so the map can't grow unbounded from unique IPs.
      if (buckets.size > 10_000) {
        for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
      }
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      reply
        .code(429)
        .header("retry-after", String(retryAfter))
        .send({ error: "rate_limited", message: "Too many requests. Try again shortly." });
    }
  };
}
