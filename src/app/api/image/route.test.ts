// POST /api/image — what a card is told when there is no picture. The card
// treats "nothing to show" and "worth another try" differently, so the route
// must say which; and the route must be allowed to run as long as a generation.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_SETTINGS } from "@/lib/images/generated";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
let currentUser: string | null = "user-1";
const generate = vi.fn();
let generatorConfigured = true;
const cacheStore = new Map<string, string>();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor(currentUser) }));
// The server's service-role client: where the allowance is spent (and where pictures are stored).
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.adminClient() }));
vi.mock("@/lib/images", () => ({ resolveImageProvider: () => ({ resolve: async () => null }) }));
vi.mock("@/lib/images/generated", async (original) => ({
  ...(await original<typeof import("@/lib/images/generated")>()),
  resolveImageGenerator: () => (generatorConfigured ? { model: "m", generate: (p: string) => generate(p) } : null),
}));
vi.mock("@/lib/images/recipeImage", async (original) => ({
  ...(await original<typeof import("@/lib/images/recipeImage")>()),
  createSupabaseImageCache: () => ({
    lookup: async (key: string) => cacheStore.get(key) ?? null,
    save: async (key: string) => {
      const url = `https://cache/${key}.webp`;
      cacheStore.set(key, url);
      return url;
    },
  }),
}));

import { maxDuration, POST } from "./route";

const call = (body: unknown) => POST(new Request("http://localhost/api/image", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  generatorConfigured = true;
  cacheStore.clear();
  generate.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db.seed("decision_sessions", { id: "s1", user_id: "user-1", context: {}, recommendations: [recipe(), recipe({ role: "lowest_effort", title: "Toast", image_query: null }), recipe({ role: "alternative", title: "Soup" })], chosen_index: null });
});

describe("POST /api/image — reasons", () => {
  it("not signed in: unavailable, and no generation", async () => {
    currentUser = null;
    expect(await (await call({ session_id: "s1", index: 0 })).json()).toEqual({ url: null, reason: "unavailable" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("someone else's session or a missing card: unavailable, and no generation", async () => {
    currentUser = "user-2";
    expect(await (await call({ session_id: "s1", index: 0 })).json()).toEqual({ url: null, reason: "unavailable" });
    currentUser = "user-1";
    expect(await (await call({ session_id: "s1", index: 7 })).json()).toEqual({ url: null, reason: "unavailable" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("no image source configured: no_image — a settled answer, not a failure", async () => {
    generatorConfigured = false;
    expect(await (await call({ session_id: "s1", index: 0 })).json()).toEqual({ url: null, reason: "no_image" });
  });

  it("the vendor failed: generation_failed — the card may offer a retry", async () => {
    generate.mockResolvedValue(null);
    expect(await (await call({ session_id: "s1", index: 0 })).json()).toEqual({ url: null, reason: "generation_failed" });
  });

  it("a generated picture is returned, then served from the cache with no second generation", async () => {
    generate.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/webp", model: "m" });
    const first = await (await call({ session_id: "s1", index: 0 })).json();
    expect(first.source).toBe("generated");
    expect(first.url).toMatch(/^https:\/\/cache\//);
    expect(await (await call({ session_id: "s1", index: 0 })).json()).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/image — the daily allowance is spent only on a paid generation", () => {
  const ok = () => generate.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "image/webp", model: "m" });
  const titled = (title: string) => recipe({ title, image_query: null });
  const seedTwo = () => db.seed("decision_sessions", { id: "s2", user_id: "user-1", context: {}, recommendations: [titled("Alpha stew"), titled("Beta salad"), titled("Gamma toast")], chosen_index: null });

  it("a generation costs one; the same picture again (a cache hit) costs nothing", async () => {
    ok();
    await call({ session_id: "s1", index: 0 });
    expect(db.usageOf("user-1", "image")).toBe(1);
    await call({ session_id: "s1", index: 0 });
    await call({ session_id: "s1", index: 0 });
    expect(db.usageOf("user-1", "image")).toBe(1);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("not configured, or an unreadable card, costs nothing", async () => {
    generatorConfigured = false;
    await call({ session_id: "s1", index: 0 });
    expect(db.usageOf("user-1", "image")).toBe(0);
  });

  it("three cards asking at once for the same recipe share one generation and one unit", async () => {
    ok();
    await Promise.all([call({ session_id: "s1", index: 0 }), call({ session_id: "s1", index: 0 }), call({ session_id: "s1", index: 0 })]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(db.usageOf("user-1", "image")).toBe(1);
  });

  it("past the daily allowance: 429 limit_reached, nothing is generated — but pictures already made are still served", async () => {
    vi.stubEnv("USAGE_LIMIT_IMAGE", "1");
    ok();
    seedTwo();
    const first = await call({ session_id: "s2", index: 0 });
    expect((await first.json()).source).toBe("generated");
    const refused = await call({ session_id: "s2", index: 1 });
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ url: null, reason: "limit_reached" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect((await call({ session_id: "s2", index: 0 })).status).toBe(200); // the cached one is free
    vi.unstubAllEnvs();
  });

  it("an allowance that can't be checked (production) generates nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    db.failRpc({ code: "PGRST202", message: "no function" });
    ok();
    const res = await call({ session_id: "s1", index: 0 });
    expect((await res.json()).reason).toBe("limit_reached");
    expect(generate).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe("POST /api/image — time budget", () => {
  it("may run longer than a generation is allowed to — else the host kills it after the vendor was paid and before it is cached", () => {
    expect(maxDuration * 1000).toBeGreaterThan(IMAGE_SETTINGS.timeoutMs);
  });
});
