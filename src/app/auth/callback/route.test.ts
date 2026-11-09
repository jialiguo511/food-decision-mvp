// /auth/callback — where the emailed link lands. The `next` parameter is attacker-controllable
// (anyone can craft a link), so it must never send a signed-in person to another site.

import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) }));

import { GET } from "./route";

const ORIGIN = "https://app.example";
const get = (query: string) => GET(new Request(`${ORIGIN}/auth/callback?${query}`) as never);
const where = (res: Response) => res.headers.get("location");

beforeEach(() => {
  exchange.mockReset();
  exchange.mockResolvedValue({ error: null });
});

describe("a good link", () => {
  it("signs in and goes Home by default", async () => {
    expect(where(await get("code=abc"))).toBe(`${ORIGIN}/today`);
    expect(exchange).toHaveBeenCalledWith("abc");
  });

  it("follows a plain in-site destination", async () => {
    expect(where(await get("code=abc&next=/saved"))).toBe(`${ORIGIN}/saved`);
  });
});

describe("a crafted `next` never leaves the site", () => {
  it.each(["@evil.example", "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", ".evil.example"])("%s", async (next) => {
    const location = where(await get(`code=abc&next=${encodeURIComponent(next)}`));
    expect(location).toBe(`${ORIGIN}/today`);
    expect(new URL(location!).host).toBe("app.example");
  });
});

describe("a link that doesn't work", () => {
  it("no code, or a code Supabase refuses (expired, already used, opened in another browser), lands on sign-in with a reason", async () => {
    expect(where(await get(""))).toBe(`${ORIGIN}/login?error=link_expired`);
    exchange.mockResolvedValue({ error: { message: "invalid flow state" } });
    expect(where(await get("code=old&next=/saved"))).toBe(`${ORIGIN}/login?error=link_expired`);
  });
});
