// POST /api/recommend for the cross-way ("open") request: ONE model call, no location,
// no places lookup, stored as an ordinary session, and the same hard constraints.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
const generate = vi.fn();
const resolvePlaces = vi.fn(() => null);

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor("user-1") }));
vi.mock("./claude", () => ({ generateRecommendations: (...args: unknown[]) => generate(...args) }));
vi.mock("@/lib/places", () => ({ resolvePlacesProvider: () => resolvePlaces() }));

import { POST } from "./route";

const OPEN = {
  decision_mode: "open", hunger: "light", ways: { cook: true, buy: true }, minutes: null, effort: null, extra_spend_usd: null, meal_budget: "no_preference",
  ingredients_on_hand: [], craving: null, after_exercise: true, protein_focus: true, easy_pick: false,
};
const request = (context: unknown) => POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify({ context }) }));

beforeEach(() => {
  db = createFakeDb();
  generate.mockReset();
  resolvePlaces.mockClear();
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  generate.mockResolvedValue({ ok: true, recommendations: [recipe({ title: "Tuna wrap" })], insufficientInventory: false, model: "m" });
});

describe("the open request", () => {
  it("is accepted, asks the model ONCE with the open hard constraints, and never looks up places", async () => {
    const res = await request(OPEN);
    expect(res.status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
    const input = generate.mock.calls[0][1] as { decision_mode: string; hard_constraints: { ways: unknown } };
    expect(input.decision_mode).toBe("open");
    expect(input.hard_constraints.ways).toEqual({ cook: true, buy: true });
    expect(resolvePlaces).not.toHaveBeenCalled(); // no location, no restaurants
  });

  it("is stored as a normal session, so Save, Choose and feedback have a session to point at", async () => {
    const res = await request(OPEN);
    const body = (await res.json()) as { session_id: string };
    expect(body.session_id).toBeTruthy();
    const row = db.tables.decision_sessions?.[0] as { context: { decision_mode: string } } | undefined;
    expect(row?.context.decision_mode).toBe("open");
  });

  it("a request that allows no way, or carries an out-of-range field, is refused before any model call", async () => {
    expect((await request({ ...OPEN, ways: { cook: false, buy: false } })).status).toBe(400);
    expect((await request({ ...OPEN, minutes: 1 })).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  it("Kitchen staples are read only when cooking is allowed", async () => {
    db.seed("kitchen_staples", { user_id: "user-1", name: "Salt" });
    await request({ ...OPEN, ways: { cook: false, buy: true } });
    expect((generate.mock.calls[0][1] as { soft_preferences: { ingredients_on_hand: string[] } }).soft_preferences.ingredients_on_hand).toEqual([]);
    generate.mockClear();
    await request(OPEN);
    expect((generate.mock.calls[0][1] as { soft_preferences: { ingredients_on_hand: string[] } }).soft_preferences.ingredients_on_hand).toEqual(["Salt"]);
  });
});
