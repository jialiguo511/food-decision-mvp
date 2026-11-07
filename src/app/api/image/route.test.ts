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

describe("POST /api/image — time budget", () => {
  it("may run longer than a generation is allowed to — else the host kills it after the vendor was paid and before it is cached", () => {
    expect(maxDuration * 1000).toBeGreaterThan(IMAGE_SETTINGS.timeoutMs);
  });
});
