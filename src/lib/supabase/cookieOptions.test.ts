import { describe, expect, it } from "vitest";
import { isHttpsRequest, sessionCookieOptions } from "./cookieOptions";

describe("session cookie attributes", () => {
  it("adds Secure over https and keeps what Supabase set", () => {
    const out = sessionCookieOptions({ path: "/", sameSite: "lax", maxAge: 100, httpOnly: false }, true);
    expect(out).toEqual({ path: "/", sameSite: "lax", maxAge: 100, httpOnly: false, secure: true });
  });

  it("does not add Secure over plain http (local development)", () => {
    expect(sessionCookieOptions({ path: "/" }, false)).not.toHaveProperty("secure");
  });

  it("supplies SameSite=Lax when it is missing, and keeps a stricter value", () => {
    expect(sessionCookieOptions(undefined, false).sameSite).toBe("lax");
    expect(sessionCookieOptions({ sameSite: "strict" }, true).sameSite).toBe("strict");
  });

  it("keeps a removal (maxAge 0) a removal", () => {
    expect(sessionCookieOptions({ path: "/", maxAge: 0 }, true).maxAge).toBe(0);
  });
});

describe("isHttpsRequest", () => {
  it("trusts the proxy's forwarded protocol, falls back to the URL", () => {
    expect(isHttpsRequest(new Headers({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(isHttpsRequest(new Headers({ "x-forwarded-proto": "https, http" }))).toBe(true);
    expect(isHttpsRequest(new Headers({ "x-forwarded-proto": "http" }), "https://x.example")).toBe(false);
    expect(isHttpsRequest(new Headers(), "https://x.example/a")).toBe(true);
    expect(isHttpsRequest(new Headers(), "http://localhost:3000/a")).toBe(false);
    expect(isHttpsRequest(new Headers())).toBe(false);
  });
});
