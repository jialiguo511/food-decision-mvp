import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT, safeNextPath } from "./safeNext";

describe("safeNextPath — the post-sign-in destination is a path on this site, or Home", () => {
  it("keeps ordinary in-site paths", () => {
    expect(safeNextPath("/saved")).toBe("/saved");
    expect(safeNextPath("/profile?tab=account")).toBe("/profile?tab=account");
    expect(safeNextPath("/today")).toBe("/today");
  });

  it("falls back to Home for nothing", () => {
    for (const v of [null, undefined, "", "   "]) expect(safeNextPath(v as string | null)).toBe(DEFAULT_NEXT);
  });

  it("refuses every way of leaving the site", () => {
    for (const evil of [
      "@evil.example", // origin + this = https://app@evil.example
      ".evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "https://evil.example",
      "http://evil.example/x",
      "javascript:alert(1)",
      "/%0d%0aSet-Cookie:x=1".replace("%0d%0a", "\r\n"),
      "/ok\tand-tab",
      "/a b",
      "///evil.example",
      "/" + "a".repeat(300),
    ]) {
      expect(safeNextPath(evil), evil).toBe(DEFAULT_NEXT);
    }
  });

  it("never loops back into the sign-in machinery", () => {
    expect(safeNextPath("/auth/callback?code=1")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("/login")).toBe(DEFAULT_NEXT);
  });
});
