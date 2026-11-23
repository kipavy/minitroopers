export interface RateLimiter {
  /** Records a hit; false when `key` exceeded `limit` hits in the current window. */
  hit(key: string): boolean;
}

/** In-memory fixed-window limiter (single process, local server). */
export function createRateLimiter(o: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = o.now ?? Date.now;
  const buckets = new Map<string, { start: number; n: number }>();
  return {
    hit(key) {
      const t = now();
      if (buckets.size > 10_000) for (const [k, b] of buckets) if (t - b.start >= o.windowMs) buckets.delete(k);
      let b = buckets.get(key);
      if (!b || t - b.start >= o.windowMs) {
        b = { start: t, n: 0 };
        buckets.set(key, b);
      }
      b.n++;
      return b.n <= o.limit;
    },
  };
}
