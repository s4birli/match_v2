import { headers } from "next/headers";

/**
 * Tiny in-memory rate limiter.
 *
 * Suitable for a single-process dev / staging deployment. For multi-region
 * production swap the backing store for Upstash Ratelimit, Vercel KV,
 * Redis, or Cloudflare KV. The interface is intentionally tiny so the
 * call sites can stay the same when that swap happens.
 *
 * Each call to `rateLimit(bucket, key, ...)` returns
 *   { allowed: true } if the caller is under the limit, or
 *   { allowed: false, retryAfterSec } if they should back off.
 *
 * Buckets are independent (login attempts and password-reset requests
 * use different buckets so a slow login can't lock out password reset).
 *
 * Auto-pruning: every call sweeps expired entries to keep the map bounded.
 * Even with millions of unique keys this stays under a few MB because
 * windows expire in minutes.
 */
type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Map<string, Hit>>();

function getBucket(name: string): Map<string, Hit> {
  let b = buckets.get(name);
  if (!b) {
    b = new Map();
    buckets.set(name, b);
  }
  return b;
}

function prune(bucket: Map<string, Hit>, now: number) {
  // Walk a small slice each call instead of the whole map — keeps the
  // amortised cost O(1).
  let n = 0;
  for (const [k, v] of bucket) {
    if (v.resetAt <= now) bucket.delete(k);
    if (++n > 32) break;
  }
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export function rateLimit(opts: {
  bucket: string;
  key: string;
  limit: number;
  windowSec: number;
}): RateLimitResult {
  const now = Date.now();
  const bucket = getBucket(opts.bucket);
  prune(bucket, now);

  const cur = bucket.get(opts.key);
  if (!cur || cur.resetAt <= now) {
    bucket.set(opts.key, { count: 1, resetAt: now + opts.windowSec * 1000 });
    return { allowed: true };
  }
  if (cur.count >= opts.limit) {
    return { allowed: false, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) };
  }
  cur.count += 1;
  return { allowed: true };
}

/**
 * Best-effort client identifier for the rate limiter. Prefers the
 * `x-forwarded-for` header (set by Vercel / Cloudflare / nginx) and
 * falls back to "anon" so dev requests are still bucketed.
 *
 * NOT spoof-resistant on its own — pair with the user-supplied identifier
 * (email, account id) when available.
 */
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = h.get("x-real-ip");
    if (real) return real;
  } catch {
    /* no headers in this context */
  }
  return "anon";
}
