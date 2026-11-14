// The sign-in confirmation page is reached with a one-time secret in its address, so its responses
// must carry no Referer, no caching and no indexing. This reads the real next.config.ts and applies
// Next's own rule (a later matching entry wins for a repeated key).

import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const prefix = rule.source.replace("/:path*", "");
    if (prefix === "" || path === prefix || path.startsWith(`${prefix}/`)) for (const h of rule.headers) out[h.key] = h.value;
  }
  return out;
}

describe("response headers", () => {
  it("everything under /auth/ sends no Referer, is uncacheable and is not indexed", async () => {
    for (const path of ["/auth/confirm", "/auth/confirm/verify", "/auth/callback"]) {
      const h = await headersFor(path);
      expect(h["Referrer-Policy"]).toBe("no-referrer");
      expect(h["Cache-Control"]).toMatch(/no-store/);
      expect(h["X-Robots-Tag"]).toMatch(/noindex/);
    }
  });

  it("the rest of the site keeps its existing policy and is not forced uncacheable", async () => {
    const h = await headersFor("/today");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Cache-Control"]).toBeUndefined();
  });

  it("frame, base and form restrictions still apply on the confirm page", async () => {
    const h = await headersFor("/auth/confirm");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("form-action 'self'");
  });
});
