// POST /api/recommend — the daily allowance and the product events around it.
// The point of the limit is that it holds where a front-end guard cannot: when
// requests fail, when they arrive together, and when the database that counts
// them can't answer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
let currentUser: string | null = "user-1";
const generate = vi.fn();
const searchNearby = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor(currentUser) }));
vi.mock("./claude", () => ({ generateRecommendations: (...args: unknown[]) => generate(...args) }));
vi.mock("@/lib/places", () => ({ resolvePlacesProvider: () => ({ searchNearby }) }));

import { POST } from "./route";

const COOK = { decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy", craving: null, ingredients_on_hand: [], budget_override_usd: 10 };
const ORDER = { decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "delivery", meal_budget: "no_preference" };
const NEARBY = { ...ORDER, method: "eat_nearby", nearby: true };
const LOCATION = { latitude: 37.78, longitude: -122.41 };
const call = (context: unknown, extra: Record<string, unknown> = {}) =>
  POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify({ context, ...extra }) }));
const events = () => (db.tables.product_events ?? []) as { user_id: string; name: string; props: Record<string, unknown> }[];

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  generate.mockReset();
  searchNearby.mockReset();
  searchNearby.mockResolvedValue([]);
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  vi.stubEnv("USAGE_LIMIT_RECOMMEND", "3");
  vi.stubEnv("USAGE_LIMIT_NEARBY", "1");
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
  generate.mockResolvedValue({ ok: true, recommendations: [recipe({ title: "Rice Bowl" })], insufficientInventory: false, model: "m" });
});

afterEach(() => vi.unstubAllEnvs());

describe("the daily allowance holds BEFORE any paid call", () => {
  it("allows the limit, then refuses with a clear code — and the model is not called for the refused ones", async () => {
    for (let n = 0; n < 3; n++) expect((await call(COOK)).status).toBe(200);
    const refused = await call(COOK);
    expect(refused.status).toBe(429);
    expect((await refused.json()).error.code).toBe("daily_limit");
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("is per person: someone else still has their own allowance", async () => {
    for (let n = 0; n < 3; n++) await call(COOK);
    currentUser = "user-2";
    expect((await call(COOK)).status).toBe(200);
  });

  it("failed requests count too — a user can't retry a failing request forever on our money", async () => {
    generate.mockResolvedValue({ ok: false, code: "upstream_error", message: "boom" });
    for (let n = 0; n < 3; n++) expect((await call(COOK)).status).toBe(502);
    generate.mockResolvedValue({ ok: true, recommendations: [recipe()], insufficientInventory: false, model: "m" });
    expect((await call(COOK)).status).toBe(429);
  });

  it("simultaneous requests cannot slip past it: 12 at once against a limit of 3 reach the model exactly 3 times", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => call(COOK)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 429)).toHaveLength(9);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("an invalid request is refused for being invalid and does not use up the allowance", async () => {
    expect((await call({ decision_mode: "cook" })).status).toBe(400);
    expect(db.usageOf("user-1", "recommend")).toBe(0);
  });

  it("a signed-out request spends nothing", async () => {
    currentUser = null;
    expect((await call(COOK)).status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("nearby searches are metered on their own, and checked first", () => {
  it("running out of nearby searches still leaves food ideas by type — and costs a nearby search nothing it doesn't use", async () => {
    expect((await call(NEARBY, { location: LOCATION })).status).toBe(200);
    const refused = await call(NEARBY, { location: LOCATION });
    expect(refused.status).toBe(429);
    expect((await refused.json()).error.code).toBe("nearby_limit");
    expect(searchNearby).toHaveBeenCalledTimes(1); // Google Places was not searched the second time
    // The by-type alternative is a different meter and still works.
    expect((await call(ORDER)).status).toBe(200);
    // The refused nearby request did not eat into the general allowance (1 + 1 spent, not 3).
    expect(db.usageOf("user-1", "recommend")).toBe(2);
  });
});

describe("when the allowance can't be checked", () => {
  it("production refuses paid calls rather than running them unmetered", async () => {
    vi.stubEnv("NODE_ENV", "production");
    db.failRpc({ code: "PGRST202", message: "Could not find the function public.consume_usage" });
    const res = await call(COOK);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("usage_unavailable");
    expect(generate).not.toHaveBeenCalled();
  });

  it("a database error is the same: held back, not waved through", async () => {
    vi.stubEnv("NODE_ENV", "production");
    db.failRpc({ code: "57014", message: "statement timeout" });
    expect((await call(COOK)).status).toBe(503);
    expect(generate).not.toHaveBeenCalled();
  });

  it("development, with the migration simply not run yet, is let through (with a warning) so local work isn't blocked", async () => {
    vi.stubEnv("NODE_ENV", "development");
    db.failRpc({ code: "PGRST202", message: "Could not find the function public.consume_usage" });
    expect((await call(COOK)).status).toBe(200);
  });
});

describe("product events — one per request, nothing personal in them", () => {
  it("records recommend_done with the mode, how it started, how long, and how many cards", async () => {
    await call(COOK, { entry: "sentence" });
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ user_id: "user-1", name: "recommend_done", props: { mode: "cook", entry: "sentence", ok: true, count: 1 } });
    expect(typeof events()[0].props.ms).toBe("number");
  });

  it("records a failure with its code", async () => {
    generate.mockResolvedValue({ ok: false, code: "malformed_output", message: "bad json" });
    await call(COOK);
    expect(events()[0].props).toMatchObject({ ok: false, code: "malformed_output", mode: "cook" });
  });

  it("records a refused day as limit_hit AND as the failed recommend_done it is", async () => {
    for (let n = 0; n < 3; n++) await call(COOK);
    await call(COOK);
    const names = events().map((e) => e.name);
    expect(names.filter((n) => n === "limit_hit")).toHaveLength(1);
    expect(events().find((e) => e.name === "limit_hit")!.props).toEqual({ kind: "recommend" });
    expect(events().at(-1)!.props).toMatchObject({ ok: false, code: "daily_limit" });
  });

  it("holds no answers, no foods, no craving and no coordinates — only enumerated values and numbers", async () => {
    await call({ ...COOK, craving: "xylophone-casserole", ingredients_on_hand: ["secret-ingredient-7731"] }, { entry: "steps" });
    await call(NEARBY, { location: LOCATION, entry: "sentence" });
    const serialized = JSON.stringify(events());
    for (const leak of ["xylophone", "secret-ingredient", "37.78", "-122.41", "latitude", "longitude"]) expect(serialized).not.toContain(leak);
    for (const e of events()) {
      for (const [key, value] of Object.entries(e.props)) {
        expect(["mode", "nearby", "entry", "ok", "code", "ms", "count", "kind"], key).toContain(key);
        expect(["string", "number", "boolean"]).toContain(typeof value);
      }
    }
  });

  it("an event that can't be written never fails the request", async () => {
    db.failTable("product_events", { code: "PGRST205", message: "missing table" });
    expect((await call(COOK)).status).toBe(200);
  });
});
