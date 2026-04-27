/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * State is local to each serverless instance, so this provides per-instance
 * protection rather than a global cap. For stronger guarantees (e.g. burst
 * protection across all Vercel instances) swap the Map for Vercel KV or
 * Upstash Redis.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 5 })
 *   const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
 *   if (!limiter.check(ip)) return new Response('Too many requests', { status: 429 })
 */

interface Entry {
  count: number
  resetAt: number
}

export interface RateLimiter {
  /** Returns true if the request is allowed, false if it should be rejected. */
  check(key: string): boolean
}

export function createRateLimiter({
  windowMs,
  max,
}: {
  windowMs: number
  max: number
}): RateLimiter {
  const store = new Map<string, Entry>()

  // Periodically prune expired entries to prevent unbounded memory growth.
  // Only runs while the instance is warm; entries are naturally discarded on
  // cold starts anyway.
  const pruneInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key)
    }
  }, windowMs)

  // Allow the process to exit without waiting for the interval.
  if (pruneInterval.unref) pruneInterval.unref()

  return {
    check(key: string): boolean {
      const now = Date.now()
      const entry = store.get(key)

      if (!entry || entry.resetAt < now) {
        store.set(key, { count: 1, resetAt: now + windowMs })
        return true
      }

      if (entry.count >= max) return false
      entry.count++
      return true
    },
  }
}
