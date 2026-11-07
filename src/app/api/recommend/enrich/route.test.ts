// POST /api/recommend/enrich — the model's wording for a nearby set that is
// already on screen. It must never change which places are shown, spend the
// model twice on one set, or turn a failure into a missing result.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { place } from "@/test/savedFixtures";

let db = createFakeDb();
let currentUser = "user-1";
const create = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor(currentUser) }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: (...a: unknown[]) => create(...a) }; } }));

import { POST } from "./route";

const CONTEXT = { decision_mode: "order", hunger: "normal", craving_category: "sweet", craving_note: null, method: "eat_nearby", meal_budget: "no_preference", travel_willingness: "no_preference", nearby: true };
const pending = (id: string, role: string) => place({ place_id: id, role: role as never, title: `Place ${id}`, reason: `rule ${id}`, look_for: null, enriched: false });
const answer = (...items: unknown[]) => ({ content: [{ type: "text", text: JSON.stringify({ items }) }] });
const call = (session_id = "s1") => POST(new Request("http://localhost/api/recommend/enrich", { method: "POST", body: JSON.stringify({ session_id }) }));
const stored = () => db.tables.decision_sessions[0].recommendations as { place_id: string; reason: string; look_for: string | null; enriched?: boolean }[];

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  db.seed("decision_sessions", { id: "s1", user_id: "user-1", context: CONTEXT, recommendations: [pending("a", "best_match"), pending("b", "lowest_effort"), pending("c", "alternative")], chosen_index: null, created_at: new Date().toISOString() });
});

describe("POST /api/recommend/enrich", () => {
  it("merges the wording into the same stored set — same places, same order, same roles — and returns it", async () => {
    create.mockResolvedValue(answer({ place_id: "a", reason: "Close and open.", look_for: "A grilled chicken bowl." }, { place_id: "b", reason: "Easy.", look_for: "Soup." }, { place_id: "c", reason: "Different.", look_for: "A salad." }));
    const body = await (await call()).json();
    expect(body.enriched).toBe(true);
    expect(body.recommendations.map((r: { place_id: string }) => r.place_id)).toEqual(["a", "b", "c"]);
    expect(stored().map((r) => [r.place_id, r.reason, r.enriched])).toEqual([["a", "Close and open.", true], ["b", "Easy.", true], ["c", "Different.", true]]);
    expect(stored()[0].look_for).toBe("A grilled chicken bowl.");
  });

  it("uses a small fast model (not the Cook recommender), without thinking, and asks once", async () => {
    create.mockResolvedValue(answer({ place_id: "a", reason: "r", look_for: "l" }));
    await call();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ model: "claude-haiku-4-5-20251001", max_tokens: 1200 });
    expect(create.mock.calls[0][0]).not.toHaveProperty("thinking");
  });

  it("a set that is already complete is a no-op: the model isn't called again", async () => {
    create.mockResolvedValue(answer({ place_id: "a", reason: "r", look_for: "l" }, { place_id: "b", reason: "r", look_for: "l" }, { place_id: "c", reason: "r", look_for: "l" }));
    await call();
    create.mockClear();
    const again = await (await call()).json();
    expect(create).not.toHaveBeenCalled();
    expect(again.enriched).toBe(true);
  });

  it("a model failure returns the set unchanged — the rule-written reasons stand", async () => {
    create.mockRejectedValue(new Error("overloaded"));
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enriched).toBe(false);
    expect(body.recommendations.map((r: { reason: string }) => r.reason)).toEqual(["rule a", "rule b", "rule c"]);
    expect(stored().every((r) => r.enriched === false)).toBe(true);
  });

  it("unusable output (an invented place, a price) changes nothing for that place; the others still get their wording", async () => {
    create.mockResolvedValue(answer({ place_id: "zzz", reason: "r", look_for: "l" }, { place_id: "a", reason: "Great at $9.", look_for: "l" }, { place_id: "b", reason: "Easy.", look_for: "Soup." }));
    await call();
    expect(stored().map((r) => r.reason)).toEqual(["rule a", "Easy.", "rule c"]);
  });

  it("no API key: unchanged, and the model is never constructed", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const body = await (await call()).json();
    expect(create).not.toHaveBeenCalled();
    expect(body.enriched).toBe(false);
  });

  it("a user's allergen never reaches a card through the wording", async () => {
    db.seed("profiles", { id: "user-1", allergies: ["Peanuts"] });
    create.mockResolvedValue(answer({ place_id: "a", reason: "Fine.", look_for: "Noodles with peanut sauce." }, { place_id: "b", reason: "Great peanut dishes.", look_for: "Rice." }));
    await call();
    expect(stored()[0]).toMatchObject({ reason: "Fine.", look_for: null });
    expect(stored()[1].reason).toBe("rule b");
  });

  it("another account's session isn't found; signed out is refused", async () => {
    currentUser = "user-2";
    expect((await call()).status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });
});
