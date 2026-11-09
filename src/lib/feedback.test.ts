import { describe, expect, it } from "vitest";
import { appVersion, FEEDBACK_MAX_MESSAGE, feedbackPage, validateFeedback } from "./feedback";

describe("validateFeedback", () => {
  it("accepts a kind and a message, trims, and treats a blank contact as none", () => {
    expect(validateFeedback({ kind: "bug", message: "  It spun forever.  ", contact: "   ", page: "/today" })).toEqual({
      ok: true,
      value: { kind: "bug", message: "It spun forever.", contact: null, page: "/today" },
    });
  });

  it("keeps a contact the person typed", () => {
    const result = validateFeedback({ kind: "idea", message: "Add X", contact: "  me@example.com ", page: "/saved" });
    expect(result.ok && result.value.contact).toBe("me@example.com");
  });

  it("rejects an unknown kind, no message, a non-string message, and an over-long message or contact", () => {
    expect(validateFeedback({ kind: "spam", message: "x" }).ok).toBe(false);
    expect(validateFeedback({ kind: "bug", message: "   " }).ok).toBe(false);
    expect(validateFeedback({ kind: "bug", message: { text: "x" } }).ok).toBe(false);
    expect(validateFeedback({ kind: "bug", message: "x".repeat(FEEDBACK_MAX_MESSAGE + 1) }).ok).toBe(false);
    expect(validateFeedback({ kind: "bug", message: "x", contact: "c".repeat(201) }).ok).toBe(false);
  });

  it("only a bare path survives as the page: no query string, no fragment, no other site", () => {
    expect(feedbackPage("/saved?tab=places&token=abc#x")).toBe("/saved");
    for (const bad of ["https://evil.example/x", "//evil.example", "saved", "/a b", "/" + "a".repeat(80), 5, null, undefined]) expect(feedbackPage(bad), String(bad)).toBeNull();
  });
});

describe("appVersion", () => {
  it("is the short commit when the host provides one, otherwise 'dev' — never arbitrary text", () => {
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: "1c8a32e2f6e8e9d1c2b3a4958677665544332211" })).toBe("1c8a32e");
    expect(appVersion({})).toBe("dev");
    expect(appVersion({ VERCEL_GIT_COMMIT_SHA: "<script>alert(1)</script>" })).toBe("dev");
  });
});
