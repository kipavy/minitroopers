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

/**
 * Password-guessing limits shared by `/login` and `/protect` (one instance per app).
 * UNVERIFIED: attempt limits (10 per 10 min per IP+army, 40 per IP) are ours; the original's are unknown.
 */
export interface PasswordLimits {
  /** False when the attempt must be refused (too many tries from this IP for this army, or from this IP overall). */
  allow(ip: string, armyId: number): boolean;
}

export function createPasswordLimits(now: () => number): PasswordLimits {
  const perArmy = createRateLimiter({ limit: 10, windowMs: 600_000, now });
  const perIp = createRateLimiter({ limit: 40, windowMs: 600_000, now });
  return { allow: (ip, armyId) => perArmy.hit(`${ip}|${armyId}`) && perIp.hit(ip) };
}
