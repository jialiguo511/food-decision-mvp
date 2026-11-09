import { describe, expect, it } from "vitest";
import { isCrossSite, refuseCrossSite } from "./sameOrigin";

const req = (headers: Record<string, string>) => new Request("https://app.example/api/recommend", { method: "POST", headers });

describe("isCrossSite", () => {
  it("passes our own pages, a missing Origin (curl, server, same-site navigation), and a proxied host", () => {
    expect(isCrossSite(req({ origin: "https://app.example", host: "app.example" }))).toBe(false);
    expect(isCrossSite(req({ host: "app.example" }))).toBe(false);
    expect(isCrossSite(req({ origin: "https://app.example", host: "internal:3000", "x-forwarded-host": "app.example" }))).toBe(false);
  });
  it("refuses another site, a lookalike host and an opaque origin", () => {
    expect(isCrossSite(req({ origin: "https://evil.example", host: "app.example" }))).toBe(true);
    expect(isCrossSite(req({ origin: "https://app.example.evil.example", host: "app.example" }))).toBe(true);
    expect(isCrossSite(req({ origin: "null", host: "app.example" }))).toBe(true);
  });
  it("answers 403 before anything else", async () => {
    const res = refuseCrossSite(req({ origin: "https://evil.example", host: "app.example" }));
    expect(res?.status).toBe(403);
    expect(refuseCrossSite(req({ host: "app.example" }))).toBeNull();
  });
});
