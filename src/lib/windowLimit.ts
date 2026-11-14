// A small sliding-window limiter for ONE unauthenticated route (/auth/confirm/verify), keyed by
// client IP.
//
// What it is and is not: it lives in the memory of one server instance, so on a serverless host it
// resets on a cold start and is not shared between instances. It stops a single client from hammering
// the route; it is NOT the durable, app-wide meter that guards paid calls (src/lib/usage/). It matters
// because that route calls Supabase from OUR server, so every caller shares our server's IP in
// Supabase's own per-IP verification limit — see docs/RELEASE.md §6.7.

export type WindowLimiter = { allow: (key: string, now?: number) => boolean };

export function createWindowLimiter(options: { limit: number; windowMs: number; maxKeys: number }): WindowLimiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key, now = Date.now()) {
      const since = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      // Re-insert so the Map stays in least-recently-used order.
      hits.delete(key);
      hits.set(key, recent);
      // Bounded memory: drop the longest-idle keys.
      while (hits.size > options.maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      return true;
    },
  };
}

/** The caller's address as the host's proxy reports it; "unknown" shares one bucket. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
