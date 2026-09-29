import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlacesError, type NearbyPlace, type PlacesProvider } from "@/lib/places/provider";

// External boundaries only: Supabase, the places provider, and the model.
const insert = vi.fn();
const searchNearby = vi.fn<PlacesProvider["searchNearby"]>();
const generate = vi.fn();
let placesConfigured = true;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => {
      if (table === "decision_sessions") {
        return { insert: (row: unknown) => (insert(row), { select: () => ({ single: async () => ({ data: { id: "session-1" }, error: null }) }) }) };
      }
      // profiles / kitchen_staples
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { dislikes: ["Pork"] }, error: null }), then: undefined }) }) };
    },
  }),
}));
vi.mock("@/lib/places", () => ({
  resolvePlacesProvider: () => (placesConfigured ? { searchNearby } : null),
}));
vi.mock("./claude", () => ({ generateRecommendations: (...args: unknown[]) => generate(...args) }));

import { POST } from "./route";

const CONTEXT = {
  decision_mode: "order",
  hunger: "normal",
  craving_category: "no_preference",
  craving_note: null,
  method: "eat_nearby",
  meal_budget: "no_preference",
  nearby: true,
};
const LOCATION = { latitude: 37.7812345, longitude: -122.4112345 };

function place(id: string, overrides: Partial<NearbyPlace> = {}): NearbyPlace {
  return {
    id,
    name: `Place ${id}`,
    category: "Restaurant",
    primary_type: "restaurant",
    address: null,
    location: { latitude: 37.782, longitude: -122.411 },
    operational: true,
    open_now: true,
    price_level: null,
    maps_url: `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
    ...overrides,
  };
}

function request(body: unknown) {
  return POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  placesConfigured = true;
  insert.mockClear();
  searchNearby.mockReset();
  generate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("POST /api/recommend — nearby", () => {
  it("fails clearly, and before searching, when the Places key isn't configured", async () => {
    placesConfigured = false;
    const res = await request({ context: CONTEXT, location: LOCATION });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("places_not_configured");
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("does not need the Places key for the ordinary category flow", async () => {
    placesConfigured = false;
    generate.mockResolvedValue({ ok: true, recommendations: [], insufficientInventory: false, model: "m" });
    const res = await request({ context: { ...CONTEXT, nearby: undefined } });
    expect(res.status).toBe(200);
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("rejects a nearby request that has no location", async () => {
    const res = await request({ context: CONTEXT });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_location");
    expect(searchNearby).not.toHaveBeenCalled();
  });

  it("maps a provider failure to a friendly error without leaking provider detail", async () => {
    searchNearby.mockRejectedValue(new PlacesError("request_failed", "HTTP 403 PERMISSION_DENIED API key not valid"));
    const res = await request({ context: CONTEXT, location: LOCATION });
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error.code).toBe("places_unavailable");
    expect(JSON.stringify(body)).not.toMatch(/403|PERMISSION_DENIED|API key/);
    expect(generate).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns an honest empty result — without asking the model — when nothing real is nearby", async () => {
    searchNearby.mockResolvedValue([place("closed", { operational: false }), place("bar", { primary_type: "bar" })]);
    const res = await request({ context: CONTEXT, location: LOCATION });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.recommendations).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("searches with rounded coordinates, hands the model only filtered candidates, and stores no coordinates", async () => {
    searchNearby.mockResolvedValue([place("a"), place("b"), place("closed", { open_now: false })]);
    generate.mockResolvedValue({
      ok: true,
      recommendations: [{ decision_mode: "nearby", role: "best_match", title: "Place a", place_id: "a" }],
      insufficientInventory: false,
      model: "test-model",
    });

    const res = await request({ context: CONTEXT, location: LOCATION });
    expect(res.status).toBe(200);

    // One request from the client = exactly one Places search and one model call.
    expect(searchNearby).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledTimes(1);
    const searched = searchNearby.mock.calls[0][0];
    expect(searched.location).toEqual({ latitude: 37.7812, longitude: -122.4112 });

    const candidates = generate.mock.calls[0][2] as { id: string }[];
    expect(candidates.map((c) => c.id).sort()).toEqual(["a", "b"]);

    // Dislikes reach the model as a soft preference; no hard constraint is invented.
    const modelInput = generate.mock.calls[0][1];
    expect(modelInput.hard_constraints).toEqual({ decision_mode: "nearby" });
    expect(modelInput.soft_preferences.disliked_foods).toEqual(["Pork"]);

    const stored = JSON.stringify(insert.mock.calls[0][0]);
    expect(stored).not.toMatch(/37\.78|122\.41|latitude|longitude/);
    expect(insert.mock.calls[0][0].context.nearby).toBe(true);
  });

  it("surfaces a rejected model output (e.g. an invented place) as an error, and stores nothing", async () => {
    searchNearby.mockResolvedValue([place("a")]);
    generate.mockResolvedValue({
      ok: false,
      code: "malformed_output",
      message: "The model returned something we couldn't use.",
      details: ["best_match: place_id is not one of this request's candidates."],
    });
    const res = await request({ context: CONTEXT, location: LOCATION });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("malformed_output");
    expect(insert).not.toHaveBeenCalled();
  });

  it("excludes previously shown places on 'Show me 3 more'", async () => {
    searchNearby.mockResolvedValue([place("a"), place("b")]);
    generate.mockResolvedValue({ ok: true, recommendations: [], insufficientInventory: false, model: "m" });
    const previous = [
      {
        decision_mode: "nearby",
        role: "best_match",
        title: "Place a",
        place_id: "a",
        reason: "r",
        look_for: "l",
        category: null,
        address: null,
        distance_m: 100,
        open_now: null,
        price_level: null,
        maps_url: "https://www.google.com/maps/search/?api=1&query_place_id=a",
      },
    ];
    await request({ context: CONTEXT, location: LOCATION, previous_recommendations: previous });
    const candidates = generate.mock.calls[0][2] as { id: string }[];
    expect(candidates.map((c) => c.id)).toEqual(["b"]);
  });

  it("gives the model the meal budget and each candidate's budget fit — unknown price stays a candidate", async () => {
    searchNearby.mockResolvedValue([
      place("cheap", { price_level: "inexpensive" }),
      place("fancy", { price_level: "very_expensive" }),
      place("unpriced", { price_level: null }),
    ]);
    generate.mockResolvedValue({ ok: true, recommendations: [], insufficientInventory: false, model: "m" });

    const res = await request({ context: { ...CONTEXT, meal_budget: "under_15" }, location: LOCATION });
    expect(res.status).toBe(200);

    const modelInput = generate.mock.calls[0][1];
    expect(modelInput.soft_preferences.meal_budget).toBe("under_15");
    // The Cook-style profile budget is no longer what nearby ranks against.
    expect(modelInput.soft_preferences).not.toHaveProperty("budget_per_meal_usd");
    const fits = Object.fromEntries(
      (modelInput.candidates as { place_id: string; budget_fit: string | null }[]).map((c) => [c.place_id, c.budget_fit]),
    );
    expect(fits).toEqual({ cheap: "likely_fit", fancy: "unlikely_fit", unpriced: null });
    // Budget ranks; it never removes a place.
    expect((generate.mock.calls[0][2] as { id: string }[]).map((c) => c.id).sort()).toEqual(["cheap", "fancy", "unpriced"]);
    // ...and it is saved with the session, so it survives leaving Home.
    expect(insert.mock.calls[0][0].context.meal_budget).toBe("under_15");
  });

  it("treats a request without meal_budget as 'no strong preference' — no 400 for a stale page", async () => {
    searchNearby.mockResolvedValue([place("a", { price_level: "expensive" }), place("b")]);
    generate.mockResolvedValue({ ok: true, recommendations: [], insufficientInventory: false, model: "m" });
    const { meal_budget: _omit, ...withoutBudget } = CONTEXT;
    void _omit;

    const res = await request({ context: withoutBudget, location: LOCATION });
    expect(res.status).toBe(200);
    const modelInput = generate.mock.calls[0][1];
    expect(modelInput.soft_preferences.meal_budget).toBe("no_preference");
    expect((modelInput.candidates as { budget_fit: string | null }[]).map((c) => c.budget_fit)).toEqual([null, null]);
    expect(insert.mock.calls[0][0].context.meal_budget).toBe("no_preference");
  });

  it("still rejects an explicitly invalid meal_budget", async () => {
    const res = await request({ context: { ...CONTEXT, meal_budget: "cheap" }, location: LOCATION });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_context");
    expect(searchNearby).not.toHaveBeenCalled();
  });
});
