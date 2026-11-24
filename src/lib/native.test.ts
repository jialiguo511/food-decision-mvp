import { describe, expect, it } from "vitest";
import { isExternalHref, isNativeApp, RESUME_RELOAD_AFTER_MS, shouldReloadOnResume } from "./native";

const ORIGIN = "https://app.example.com";

describe("native helpers", () => {
  it("is not the app outside the Capacitor WebView", () => {
    expect(isNativeApp()).toBe(false);
  });

  it("sends other sites, maps, mail and phone out of the app; keeps our own pages in", () => {
    expect(isExternalHref("https://maps.google.com/?q=x", ORIGIN)).toBe(true);
    expect(isExternalHref("https://www.pexels.com/photo/1", ORIGIN)).toBe(true);
    expect(isExternalHref("mailto:a@b.c", ORIGIN)).toBe(true);
    expect(isExternalHref("tel:+15555555555", ORIGIN)).toBe(true);
    expect(isExternalHref("/saved", ORIGIN)).toBe(false);
    expect(isExternalHref("https://app.example.com/about", ORIGIN)).toBe(false);
    expect(isExternalHref("javascript:alert(1)", ORIGIN)).toBe(false);
    expect(isExternalHref("#top", ORIGIN)).toBe(false);
  });

  it("reloads on resume only after a long time away", () => {
    expect(shouldReloadOnResume(null, 10)).toBe(false);
    expect(shouldReloadOnResume(0, RESUME_RELOAD_AFTER_MS - 1)).toBe(false);
    expect(shouldReloadOnResume(0, RESUME_RELOAD_AFTER_MS)).toBe(true);
  });
});
