// @vitest-environment jsdom
// The bundled app's session over time, through the REAL supabase-js client used by the app
// (src/ios/supabaseClient.ts) with an in-memory stand-in for the iOS Keychain and for Supabase's
// auth server. What happens when the stored access token has expired: refreshed before the next
// request; a refresh that is refused signs the person out (no stale token is ever sent); and the
// fetch bridge always sends the fresh token.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://proj.supabase.test";
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-0123456789012345678901234567890");
vi.stubEnv("NEXT_PUBLIC_APP_API_BASE", "https://api.test");
vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.0.0");

const keychain = new Map<string, string>();
vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({
    get: async ({ key }: { key: string }) => ({ value: keychain.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void keychain.set(key, value),
    remove: async ({ key }: { key: string }) => void keychain.delete(key),
  }),
}));

const now = () => Math.floor(Date.now() / 1000);
function jwt(sub: string, exp: number) {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ sub, exp, aud: "authenticated", role: "authenticated" })}.sig`;
}
const user = { id: "u-1", aud: "authenticated", role: "authenticated", email: "t@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" };
function storeSession(accessExp: number, refresh = "refresh-1") {
  keychain.set(
    "wte-session",
    JSON.stringify({ access_token: jwt("u-1", accessExp), refresh_token: refresh, token_type: "bearer", expires_in: 3600, expires_at: accessExp, user }),
  );
}

let refreshCalls: string[];
let refreshOutcome: "ok" | "revoked";
let apiCalls: { url: string; auth: string | null; version: string | null }[];

beforeEach(() => {
  vi.resetModules();
  keychain.clear();
  refreshCalls = [];
  refreshOutcome = "ok";
  apiCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(`${SUPABASE}/auth/v1/token?grant_type=refresh_token`)) {
        const body = JSON.parse(String(init?.body)) as { refresh_token: string };
        refreshCalls.push(body.refresh_token);
        if (refreshOutcome === "revoked") return Response.json({ code: "refresh_token_not_found", message: "Invalid Refresh Token" }, { status: 400 });
        const exp = now() + 3600;
        return Response.json({ access_token: jwt("u-1", exp), refresh_token: "refresh-2", token_type: "bearer", expires_in: 3600, expires_at: exp, user });
      }
      if (url.startsWith("https://api.test/")) {
        const h = new Headers(init?.headers);
        apiCalls.push({ url, auth: h.get("authorization"), version: h.get("x-app-version") });
        return Response.json({ ok: true });
      }
      return new Response("not found", { status: 404 });
    }),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("bundled app session", () => {
  it("a valid stored session is used as is — no refresh call", async () => {
    storeSession(now() + 3000);
    const { accessToken } = await import("./supabaseClient");
    const token = await accessToken();
    expect(token).toBeTruthy();
    expect(refreshCalls).toEqual([]);
  });

  it("an expired access token is refreshed before use, and the new session is stored in the Keychain", async () => {
    storeSession(now() - 60);
    const { accessToken } = await import("./supabaseClient");
    const token = await accessToken();
    expect(refreshCalls).toEqual(["refresh-1"]);
    expect(token).not.toBeNull();
    const stored = JSON.parse(keychain.get("wte-session")!) as { refresh_token: string; expires_at: number };
    expect(stored.refresh_token).toBe("refresh-2");
    expect(stored.expires_at).toBeGreaterThan(now());
  });

  it("a refused refresh (revoked or signed out elsewhere) signs the person out: no token, Keychain cleared", async () => {
    storeSession(now() - 60);
    refreshOutcome = "revoked";
    const { accessToken } = await import("./supabaseClient");
    expect(await accessToken()).toBeNull();
    expect(keychain.has("wte-session")).toBe(false);
  });

  it("the fetch bridge sends the refreshed token (never the expired one) and the app version", async () => {
    const expired = now() - 60;
    storeSession(expired);
    const { installFetchBridge } = await import("./fetchBridge");
    installFetchBridge();
    await fetch("/api/app/home");
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].url).toBe("https://api.test/api/app/home");
    expect(apiCalls[0].version).toBe("1.0.0");
    expect(apiCalls[0].auth).not.toContain(jwt("u-1", expired));
    expect(apiCalls[0].auth).toMatch(/^Bearer /);
  });

  it("signed out: the bridge sends no Authorization header at all", async () => {
    const { installFetchBridge } = await import("./fetchBridge");
    installFetchBridge();
    await fetch("/api/app/config");
    expect(apiCalls[0].auth).toBeNull();
  });
});
