import { describe, expect, it } from "vitest";
import { clientIp, createWindowLimiter } from "./windowLimit";

describe("window limiter", () => {
  it("allows up to the limit inside the window, then refuses, then recovers", () => {
    const limiter = createWindowLimiter({ limit: 3, windowMs: 1000, maxKeys: 10 });
    expect([1, 2, 3, 4].map(() => limiter.allow("ip", 0))).toEqual([true, true, true, false]);
    expect(limiter.allow("ip", 999)).toBe(false);
    expect(limiter.allow("ip", 1001)).toBe(true);
  });

  it("counts each address separately", () => {
    const limiter = createWindowLimiter({ limit: 1, windowMs: 1000, maxKeys: 10 });
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(false);
  });

  it("keeps memory bounded by forgetting the longest-idle address", () => {
    const limiter = createWindowLimiter({ limit: 1, windowMs: 10_000, maxKeys: 2 });
    limiter.allow("a", 0);
    limiter.allow("b", 1);
    limiter.allow("c", 2); // evicts "a"
    expect(limiter.allow("a", 3)).toBe(true); // forgotten, so allowed again
    expect(limiter.allow("c", 4)).toBe(false); // still remembered
  });
});

describe("clientIp", () => {
  const ip = (headers: Record<string, string>) => clientIp(new Request("https://x.example", { headers }));
  it("takes the first forwarded address, then x-real-ip, else one shared bucket", () => {
    expect(ip({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })).toBe("1.2.3.4");
    expect(ip({ "x-real-ip": "5.6.7.8" })).toBe("5.6.7.8");
    expect(ip({})).toBe("unknown");
  });
});
