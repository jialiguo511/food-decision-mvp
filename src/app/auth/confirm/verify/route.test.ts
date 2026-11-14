// POST /auth/confirm/verify — the only place the emailed token becomes a session. Supabase is a
// stand-in that behaves like the real thing in the ways that matter here: a token works once, and
// the call needs no cookie from any browser.

import { beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "t".repeat(56);
const issued = new Set<string>();
const verifyOtp = vi.fn(async (arg: { token_hash: string; type: string }) => {
  if (!issued.has(arg.token_hash)) return { error: { status: 403, code: "otp_expired", message: `Token has expired or is invalid ${arg.token_hash}` } };
  issued.delete(arg.token_hash); // single use
  return { error: null };
});
const createClient = vi.fn(async () => ({ auth: { verifyOtp } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

import * as route from "./route";

const ORIGIN = "https://app.example";
let n = 0;
function post(body: unknown, headers: Record<string, string> = {}) {
  return route.POST(
    new Request(`${ORIGIN}/auth/confirm/verify`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        host: "app.example",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": `10.0.${Math.floor(n / 250)}.${n++ % 250}`, // a fresh client each time unless a test pins one
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => {
  issued.clear();
  issued.add(TOKEN);
  verifyOtp.mockClear();
  createClient.mockClear();
  vi.restoreAllMocks();
});

describe("only an explicit POST can use a token", () => {
  it("exports no GET (or any other method): a scanner, preview or prefetch has nothing to call", () => {
    expect(Object.keys(route).filter((k) => /^(GET|HEAD|PUT|PATCH|DELETE|OPTIONS)$/.test(k))).toEqual([]);
    expect(typeof route.POST).toBe("function");
  });

  it("does not touch the auth service before a valid POST", () => {
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(issued.has(TOKEN)).toBe(true);
  });
});

describe("signing in", () => {
  it("a returning user (Magic Link template, type=email) signs in and goes Home", async () => {
    const res = await post({ token_hash: TOKEN, type: "email" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, next: "/today" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: "email" });
  });

  it("a new account (Confirm-signup template, type=signup) signs in the same way", async () => {
    const res = await post({ token_hash: TOKEN, type: "signup" });
    expect(await json(res)).toEqual({ ok: true, next: "/today" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: "signup" });
  });

  it("works from a browser that never asked for the email: nothing but the token is sent, no cookie is read", async () => {
    // Cross-browser: the request carries no cookie at all, and still signs in.
    const res = await post({ token_hash: TOKEN, type: "email" }, { cookie: "" });
    expect(res.status).toBe(200);
    expect(Object.keys(verifyOtp.mock.calls[0][0]).sort()).toEqual(["token_hash", "type"]);
  });

  it("follows a plain in-site destination", async () => {
    expect(await json(await post({ token_hash: TOKEN, type: "email", next: "/saved" }))).toEqual({ ok: true, next: "/saved" });
  });

  it.each(["@evil.example", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "/auth/confirm", "/login"])("a crafted next (%s) never leaves the site", async (next) => {
    expect(await json(await post({ token_hash: TOKEN, type: "email", next }))).toEqual({ ok: true, next: "/today" });
  });
});

describe("a token that does not work", () => {
  it("a reused token is refused the second time", async () => {
    expect((await post({ token_hash: TOKEN, type: "email" })).status).toBe(200);
    const again = await post({ token_hash: TOKEN, type: "email" });
    expect(again.status).toBe(400);
    expect(await json(again)).toEqual({ ok: false, reason: "invalid" });
  });

  it("an expired or unknown token is refused", async () => {
    const res = await post({ token_hash: "x".repeat(56), type: "email" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, reason: "invalid" });
  });

  it("never echoes the token or a service message back, and never logs either", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const bad = "z".repeat(56);
    const res = await post({ token_hash: bad, type: "email" });
    expect(JSON.stringify(await json(res))).not.toContain(bad);
    const logged = JSON.stringify([warn.mock.calls, error.mock.calls, log.mock.calls]);
    expect(logged).not.toContain(bad);
    expect(logged).not.toMatch(/expired or is invalid/);
    expect(logged).toContain("otp_expired"); // the code is what is kept
  });

  it("a rate-limit answer from the auth service is passed on as a retryable 'rate'", async () => {
    verifyOtp.mockResolvedValueOnce({ error: { status: 429, code: "over_request_rate_limit", message: "x" } });
    const res = await post({ token_hash: TOKEN, type: "email" });
    expect(res.status).toBe(429);
    expect(await json(res)).toEqual({ ok: false, reason: "rate" });
  });

  it("an unreachable auth service is a retryable 'network', not a crash", async () => {
    verifyOtp.mockRejectedValueOnce(new Error("fetch failed"));
    const res = await post({ token_hash: TOKEN, type: "email" });
    expect(res.status).toBe(502);
    expect(await json(res)).toEqual({ ok: false, reason: "network" });
  });
});

describe("what is refused before the auth service is asked", () => {
  it.each([
    ["a malformed token", { token_hash: "short", type: "email" }],
    ["a token with markup", { token_hash: `<${"a".repeat(30)}>`, type: "email" }],
    ["a type that is another flow (recovery)", { token_hash: TOKEN, type: "recovery" }],
    ["an email-change type", { token_hash: TOKEN, type: "email_change" }],
    ["no type", { token_hash: TOKEN }],
    ["a non-object body", [1, 2]],
  ])("%s", async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("not JSON, and an oversized body", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ token_hash: TOKEN, type: "email", pad: "p".repeat(3000) }))).status).toBe(413);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("a request from another site, an opaque origin, or with no Origin (the confirm page always sends one)", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { origin: "https://app.example.evil.example" }, { origin: "null" }]) {
      expect((await post({ token_hash: TOKEN, type: "email" }, headers)).status).toBe(403);
    }
    const noOrigin = new Request(`${ORIGIN}/auth/confirm/verify`, {
      method: "POST",
      headers: { host: "app.example", "content-type": "application/json" },
      body: JSON.stringify({ token_hash: TOKEN, type: "email" }),
    });
    expect((await route.POST(noOrigin)).status).toBe(403);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("a browser that says the request is cross-site, whatever Origin claims", async () => {
    expect((await post({ token_hash: TOKEN, type: "email" }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ token_hash: TOKEN, type: "email" }, { "sec-fetch-site": "same-site" })).status).toBe(403);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("a form post (a cross-site <form> cannot send JSON without a preflight)", async () => {
    expect((await post("token_hash=x", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await post("{}", { "content-type": "text/plain" })).status).toBe(415);
  });

  it("every answer, success or refusal, is marked uncacheable", async () => {
    for (const res of [await post({ token_hash: TOKEN, type: "email" }), await post({ token_hash: TOKEN, type: "email" }), await post("x", { origin: "https://evil.example" })]) {
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});

describe("rate limiting", () => {
  it("one client address is stopped after 10 tries in five minutes, before the auth service is asked", async () => {
    const pinned = { "x-forwarded-for": "203.0.113.9" };
    const bad = { token_hash: "x".repeat(56), type: "email" };
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await post(bad, pinned)).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(verifyOtp).toHaveBeenCalledTimes(10);
    // Someone else is unaffected.
    expect((await post({ token_hash: TOKEN, type: "email" })).status).toBe(200);
  });
});
