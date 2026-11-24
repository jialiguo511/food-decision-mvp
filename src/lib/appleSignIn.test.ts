import { describe, expect, it } from "vitest";
import { isFirstSignIn, isPrivateRelayEmail, makeNonce } from "./appleSignIn";

describe("Sign in with Apple helpers", () => {
  it("makes a fresh random nonce and its SHA-256 hex digest", async () => {
    const a = await makeNonce();
    const b = await makeNonce();
    expect(a.raw).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(a.raw).not.toBe(b.raw);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a.raw));
    expect(Buffer.from(digest).toString("hex")).toBe(a.hashed);
  });

  it("a just-created, Apple-only account is a first sign-in; a returning or linked one is not", () => {
    const t = "2026-11-24T10:00:00Z";
    expect(isFirstSignIn({ created_at: t, last_sign_in_at: "2026-11-24T10:00:02Z", identities: [{}] as never })).toBe(true);
    expect(isFirstSignIn({ created_at: "2026-10-01T10:00:00Z", last_sign_in_at: t, identities: [{}] as never })).toBe(false);
    // Linked to an existing email account by Supabase (same verified email): two identities.
    expect(isFirstSignIn({ created_at: t, last_sign_in_at: t, identities: [{}, {}] as never })).toBe(false);
  });

  it("recognises Apple's private relay addresses", () => {
    expect(isPrivateRelayEmail("abc123@privaterelay.appleid.com")).toBe(true);
    expect(isPrivateRelayEmail("me@example.com")).toBe(false);
    expect(isPrivateRelayEmail(null)).toBe(false);
  });
});
