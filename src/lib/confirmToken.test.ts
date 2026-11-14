import { describe, expect, it } from "vitest";
import { confirmFailureMessage, isConfirmType, isPlausibleTokenHash, parseConfirmFragment } from "./confirmToken";

const HASH = "a".repeat(56);

describe("the emailed fragment", () => {
  it("reads token_hash and type, with or without the leading #", () => {
    expect(parseConfirmFragment(`#token_hash=${HASH}&type=email`)).toEqual({ tokenHash: HASH, type: "email", next: null });
    expect(parseConfirmFragment(`token_hash=${HASH}&type=signup`)?.type).toBe("signup");
    expect(parseConfirmFragment(`#token_hash=pkce_${HASH}&type=magiclink`)?.tokenHash).toBe(`pkce_${HASH}`);
  });

  it("carries a next value through untouched (the server is what validates it)", () => {
    expect(parseConfirmFragment(`#token_hash=${HASH}&type=email&next=/saved`)?.next).toBe("/saved");
  });

  it.each([
    ["nothing", ""],
    ["no type", `#token_hash=${HASH}`],
    ["no token", "#type=email"],
    ["too short", "#token_hash=abc&type=email"],
    ["a token with markup", `#token_hash=${HASH}<script>&type=email`],
    ["a token with a path", `#token_hash=../../${HASH}&type=email`],
    ["a type that signs in a different way", `#token_hash=${HASH}&type=recovery`],
    ["an invite", `#token_hash=${HASH}&type=invite`],
    ["an email change", `#token_hash=${HASH}&type=email_change`],
  ])("refuses %s", (_name, fragment) => {
    expect(parseConfirmFragment(fragment)).toBeNull();
  });

  it("only email, signup and magiclink are accepted types", () => {
    expect(["email", "signup", "magiclink", "recovery", "invite", "sms", "", undefined, 1].map(isConfirmType)).toEqual([true, true, true, false, false, false, false, false, false]);
  });

  it("token plausibility has a length floor and ceiling", () => {
    expect(isPlausibleTokenHash("a".repeat(19))).toBe(false);
    expect(isPlausibleTokenHash("a".repeat(20))).toBe(true);
    expect(isPlausibleTokenHash("a".repeat(129))).toBe(false);
    expect(isPlausibleTokenHash(null)).toBe(false);
  });
});

describe("failure wording", () => {
  it("always points to the way forward and never shows a service message", () => {
    for (const reason of ["invalid", "rate", "network", "refused"] as const) {
      const text = confirmFailureMessage(reason);
      expect(text).toMatch(/code|tap the button again/i);
      expect(text).not.toMatch(/otp|token|supabase|403|429/i);
    }
  });
});
