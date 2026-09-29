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

import { TRAVEL_SEARCH } from "@/lib/places/config";
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

  describe("travel willingness", () => {
    const radiusFor = async (context: Record<string, unknown>) => {
      searchNearby.mockReset();
      searchNearby.mockResolvedValue([]);
      const res = await request({ context, location: LOCATION });
      expect(res.status).toBe(200);
      return searchNearby.mock.calls[0][0].radius_m;
    };

    it("Walkable searches a small radius, Nearby a larger one, Worth a trip the largest", async () => {
      const walk = await radiusFor({ ...CONTEXT, travel_willingness: "walkable" });
      const near = await radiusFor({ ...CONTEXT, travel_willingness: "nearby" });
      const trip = await radiusFor({ ...CONTEXT, travel_willingness: "worth_a_trip" });
      expect(walk).toBe(TRAVEL_SEARCH.walkable.radius_m);
      expect(near).toBe(TRAVEL_SEARCH.nearby.radius_m);
      expect(trip).toBe(TRAVEL_SEARCH.worth_a_trip.radius_m);
      expect(walk).toBeLessThan(near);
      expect(near).toBeLessThan(trip);
    });

    it("No strong preference — and a request that omits the field — use the moderate default", async () => {
      const def = TRAVEL_SEARCH.no_preference.radius_m;
      expect(await radiusFor({ ...CONTEXT, travel_willingness: "no_preference" })).toBe(def);
      const { travel_willingness: _omit, ...oldContext } = { ...CONTEXT, travel_willingness: undefined };
      void _omit;
      expect(await radiusFor(oldContext)).toBe(def);
    });

    it("pickup never reads the travel choice, even if a stale one is sent", async () => {
      expect(await radiusFor({ ...CONTEXT, method: "pickup", travel_willingness: "worth_a_trip" })).toBe(
        TRAVEL_SEARCH.no_preference.radius_m,
      );
    });

    it("is saved with the session and passed to the model", async () => {
      searchNearby.mockResolvedValue([place("a"), place("b")]);
      generate.mockResolvedValue({ ok: true, recommendations: [], insufficientInventory: false, model: "m" });
      await request({ context: { ...CONTEXT, travel_willingness: "walkable" }, location: LOCATION });
      expect(insert.mock.calls[0][0].context.travel_willingness).toBe("walkable");
      expect(generate.mock.calls[0][1].soft_preferences.travel_willingness).toBe("walkable");
    });

    it("rejects an explicitly invalid value", async () => {
      const res = await request({ context: { ...CONTEXT, travel_willingness: "far" }, location: LOCATION });
      expect(res.status).toBe(400);
      expect(searchNearby).not.toHaveBeenCalled();
    });
  });

  describe("cost control", () => {
    it("Home's chips make no request; each explicit update is exactly one Places search", async () => {
      searchNearby.mockResolvedValue([place("a")]);
      generate.mockResolvedValue({ ok: true, recommendations: [], insufficientInventory: false, model: "m" });

      // Changing chips is client-side state only (see OrderForm.test.ts): nothing reaches the route.
      expect(searchNearby).not.toHaveBeenCalled();

      await request({ context: { ...CONTEXT, meal_budget: "under_15" }, location: LOCATION });
      expect(searchNearby).toHaveBeenCalledTimes(1);
      await request({ context: { ...CONTEXT, meal_budget: "25_to_40", travel_willingness: "nearby" }, location: LOCATION });
      expect(searchNearby).toHaveBeenCalledTimes(2);
    });

    it("a failed search is not retried automatically", async () => {
      searchNearby.mockRejectedValue(new PlacesError("request_failed", "HTTP 500"));
      await request({ context: CONTEXT, location: LOCATION });
      expect(searchNearby).toHaveBeenCalledTimes(1);
    });
  });

  describe("feasibility shortlist", () => {
    it("hands the model a diverse, feasibility-ordered shortlist with tiers — not every candidate", async () => {
      const found = Array.from({ length: 20 }, (_, i) =>
        place(`p${i}`, {
          primary_type: `type_${i % 6}`,
          category: `Type ${i % 6}`,
          price_level: i < 4 ? "very_expensive" : i < 12 ? "inexpensive" : null,
          location: { latitude: 37.782 + i * 0.0004, longitude: -122.411 },
        }),
      );
      searchNearby.mockResolvedValue(found);
      generate.mockResolvedValue({ ok: true, recommendations: [], insufficientInventory: false, model: "m" });

      await request({ context: { ...CONTEXT, meal_budget: "under_15", travel_willingness: "nearby" }, location: LOCATION });

      const shortlist = generate.mock.calls[0][2] as { id: string }[];
      const modelInput = generate.mock.calls[0][1] as { candidates: { place_id: string; feasibility: string; budget_fit: string | null }[] };
      expect(shortlist.length).toBeGreaterThan(3);
      expect(shortlist.length).toBeLessThanOrEqual(10);
      // The model sees exactly the shortlist, in the same order, each with a tier.
      expect(modelInput.candidates.map((c) => c.place_id)).toEqual(shortlist.map((c) => c.id));
      expect(modelInput.candidates.every((c) => ["strong", "ok", "weak"].includes(c.feasibility))).toBe(true);
      // Obviously over-budget places are held back while plenty of better ones exist...
      expect(modelInput.candidates.filter((c) => c.budget_fit === "unlikely_fit")).toHaveLength(0);
      // ...but unknown-price places stay eligible.
      expect(modelInput.candidates.some((c) => c.budget_fit === null)).toBe(true);
    });
  });
});
