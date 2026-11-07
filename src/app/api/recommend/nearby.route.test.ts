import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlacesError, type NearbyPlace, type PlacesProvider } from "@/lib/places/provider";

// External boundaries only: Supabase, the places provider, and the model.
const insert = vi.fn();
const searchNearby = vi.fn<PlacesProvider["searchNearby"]>();
const generate = vi.fn();
let placesConfigured = true;
let currentUser = "user-1";
type FeedbackRow = { user_id: string; provider: string; place_id: string; action: string };
let feedbackRows: FeedbackRow[] = [];
let savedPlaceIds: string[] = [];
let profileRow: Record<string, unknown> = { dislikes: ["Pork"] };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: currentUser } } }) },
    from: (table: string) => {
      if (table === "saved_places") {
        const query = {
          select: () => query,
          eq: () => query,
          in: async (_column: string, ids: string[]) => ({ data: savedPlaceIds.filter((id) => ids.includes(id)).map((place_id) => ({ place_id })), error: null }),
        };
        return query;
      }
      if (table === "place_feedback") {
        // Honors the user_id / provider filters the route asks for, like RLS + the query would.
        const filters: Record<string, string> = {};
        const query = {
          select: () => query,
          eq: (column: string, value: string) => ((filters[column] = value), query),
          limit: async () => ({
            data: feedbackRows.filter((row) => Object.entries(filters).every(([k, v]) => row[k as keyof FeedbackRow] === v)),
            error: null,
          }),
        };
        return query;
      }
      if (table === "decision_sessions") {
        return { insert: (row: unknown) => (insert(row), { select: () => ({ single: async () => ({ data: { id: "session-1" }, error: null }) }) }) };
      }
      // profiles / kitchen_staples
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profileRow, error: null }), then: undefined }) }) };
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
    website_url: null,
    ...overrides,
  };
}

function request(body: unknown) {
  return POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  placesConfigured = true;
  currentUser = "user-1";
  feedbackRows = [];
  savedPlaceIds = [];
  profileRow = { dislikes: ["Pork"] };
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
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns an honest empty result when nothing real is nearby — and asks for no wording", async () => {
    searchNearby.mockResolvedValue([place("closed", { operational: false }), place("bar", { primary_type: "bar" })]);
    const res = await request({ context: CONTEXT, location: LOCATION });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.recommendations).toEqual([]);
    expect(body.enrichment_pending).toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  describe("the places are picked by code — no model on the critical path", () => {
    it("returns three real places with rule-written reasons, never calling the model", async () => {
      searchNearby.mockResolvedValue([place("a"), place("b"), place("c"), place("d")]);
      const res = await request({ context: CONTEXT, location: LOCATION });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(generate).not.toHaveBeenCalled();
      expect(body.model).toBe("rules");
      expect(body.recommendations).toHaveLength(3);
      expect(body.recommendations.map((r: { role: string }) => r.role)).toEqual(["best_match", "lowest_effort", "alternative"]);
      expect(new Set(body.recommendations.map((r: { place_id: string }) => r.place_id)).size).toBe(3);
      for (const r of body.recommendations) {
        expect(r).toMatchObject({ decision_mode: "nearby", enriched: false, look_for: null });
        expect(r.reason.length).toBeGreaterThan(0);
      }
      // The wording is a follow-up, flagged so the client asks for it once.
      expect(body.enrichment_pending).toBe(true);
    });

    it("is deterministic: the same search gives the same three, in the same order", async () => {
      searchNearby.mockResolvedValue([place("a"), place("b"), place("c"), place("d"), place("e")]);
      const first = (await (await request({ context: CONTEXT, location: LOCATION })).json()).recommendations;
      const second = (await (await request({ context: CONTEXT, location: LOCATION })).json()).recommendations;
      expect(second).toEqual(first);
    });

    it("fewer than three real places: returns exactly those, never padded", async () => {
      searchNearby.mockResolvedValue([place("a"), place("b")]);
      const body = await (await request({ context: CONTEXT, location: LOCATION })).json();
      expect(body.recommendations).toHaveLength(2);
    });

    it("reports where the time went, with no model stage (Server-Timing)", async () => {
      searchNearby.mockResolvedValue([place("a"), place("b"), place("c")]);
      const res = await request({ context: CONTEXT, location: LOCATION });
      const timing = res.headers.get("Server-Timing") ?? "";
      for (const stage of ["auth", "profile", "places", "persist", "total"]) expect(timing).toContain(`${stage};dur=`);
      expect(timing).not.toContain("model;");
    });

    it("keeps a place's photo reference (and nothing else of the provider's) on the card", async () => {
      searchNearby.mockResolvedValue([place("a", { photo_name: "places/a/photos/p1", photo_author: "Sam" }), place("b"), place("c")]);
      const body = await (await request({ context: CONTEXT, location: LOCATION })).json();
      const withPhoto = body.recommendations.find((r: { place_id: string }) => r.place_id === "a");
      expect(withPhoto).toMatchObject({ photo_name: "places/a/photos/p1", photo_author: "Sam" });
    });
  });

  it("searches with rounded coordinates and stores no coordinates", async () => {
    searchNearby.mockResolvedValue([place("a"), place("b")]);
    const res = await request({ context: CONTEXT, location: LOCATION });
    expect(res.status).toBe(200);
    // One request from the client = exactly one Places search.
    expect(searchNearby).toHaveBeenCalledTimes(1);
    expect(searchNearby.mock.calls[0][0].location).toEqual({ latitude: 37.7812, longitude: -122.4112 });
    const stored = JSON.stringify(insert.mock.calls[0][0]);
    expect(stored).not.toMatch(/37\.78|122\.41|latitude|longitude/);
    expect(insert.mock.calls[0][0].context.nearby).toBe(true);
  });

  it("excludes previously shown places on 'Show me 3 more'", async () => {
    searchNearby.mockResolvedValue([place("a"), place("b"), place("c"), place("d")]);
    const previous = ["a", "b"].map((id) => ({
      decision_mode: "nearby", role: "best_match", title: `Place ${id}`, place_id: id, reason: "r", look_for: "l",
      category: null, address: null, distance_m: 100, open_now: null, price_level: null,
      maps_url: `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
    }));
    const body = await (await request({ context: CONTEXT, location: LOCATION, previous_recommendations: previous })).json();
    expect(body.recommendations.map((r: { place_id: string }) => r.place_id).sort()).toEqual(["c", "d"]);
  });

  describe("hard constraints decide who is eligible", () => {
    const ids = (body: { recommendations: { place_id: string }[] }) => body.recommendations.map((r) => r.place_id);

    it("a place that centres on the user's allergen is never picked", async () => {
      profileRow = { allergies: ["Fish"] };
      searchNearby.mockResolvedValue([
        place("sushi", { name: "Sushi Zen", category: "Sushi restaurant", primary_type: "sushi_restaurant" }),
        place("a"), place("b"), place("c"),
      ]);
      expect(ids(await (await request({ context: CONTEXT, location: LOCATION })).json())).not.toContain("sushi");
    });

    it("a vegetarian is never sent to a steakhouse", async () => {
      profileRow = { prefs: { dietary: { patterns: ["vegetarian"], other: null } } };
      searchNearby.mockResolvedValue([
        place("steak", { name: "Prime Steakhouse", category: "Steak house", primary_type: "steak_house" }),
        place("a"), place("b"), place("c"),
      ]);
      expect(ids(await (await request({ context: CONTEXT, location: LOCATION })).json())).not.toContain("steak");
    });

    it("dislikes stay soft — they never remove a place", async () => {
      profileRow = { dislikes: ["Pork"] };
      searchNearby.mockResolvedValue([place("bbq", { name: "Pork BBQ", category: "Barbecue restaurant" }), place("a"), place("b")]);
      expect(ids(await (await request({ context: CONTEXT, location: LOCATION })).json())).toContain("bbq");
    });
  });

  it("a tight budget prefers a clearly cheap place; an unknown price stays eligible", async () => {
    searchNearby.mockResolvedValue([
      place("fancy", { price_level: "very_expensive" }),
      place("cheap", { price_level: "inexpensive" }),
      place("unpriced", { price_level: null }),
      place("also-fancy", { price_level: "very_expensive" }),
    ]);
    const body = await (await request({ context: { ...CONTEXT, meal_budget: "under_15" }, location: LOCATION })).json();
    expect(body.recommendations[0].place_id).toBe("cheap");
    expect(body.recommendations.map((r: { place_id: string }) => r.place_id)).toContain("unpriced");
    // ...and the choice is saved with the session, so it survives leaving Home.
    expect(insert.mock.calls[0][0].context.meal_budget).toBe("under_15");
  });

  it("treats a request without meal_budget as 'no strong preference' — no 400 for a stale page", async () => {
    searchNearby.mockResolvedValue([place("a", { price_level: "expensive" }), place("b")]);
    const { meal_budget: _omit, ...withoutBudget } = CONTEXT;
    void _omit;
    const res = await request({ context: withoutBudget, location: LOCATION });
    expect(res.status).toBe(200);
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

    it("pickup uses the selected radius, like Eat nearby", async () => {
      for (const t of ["walkable", "nearby", "worth_a_trip", "no_preference"] as const) {
        expect(await radiusFor({ ...CONTEXT, method: "pickup", travel_willingness: t })).toBe(TRAVEL_SEARCH[t].radius_m);
      }
    });

    it("delivery never reads the travel choice, even if a stale one is sent", async () => {
      expect(await radiusFor({ ...CONTEXT, method: "delivery", travel_willingness: "worth_a_trip" })).toBe(TRAVEL_SEARCH.no_preference.radius_m);
    });

    it("is saved with the session, and a nearer place wins when the user wants to stay close", async () => {
      const near = place("near", { location: { latitude: 37.7813, longitude: -122.4112 } });
      const far = place("far", { location: { latitude: 37.79, longitude: -122.4112 } });
      searchNearby.mockResolvedValue([far, near, place("x"), place("y")]);
      const body = await (await request({ context: { ...CONTEXT, travel_willingness: "walkable" }, location: LOCATION })).json();
      expect(insert.mock.calls[0][0].context.travel_willingness).toBe("walkable");
      expect(body.recommendations[0].place_id).not.toBe("far");
    });

    it("rejects an explicitly invalid value", async () => {
      const res = await request({ context: { ...CONTEXT, travel_willingness: "far" }, location: LOCATION });
      expect(res.status).toBe(400);
      expect(searchNearby).not.toHaveBeenCalled();
    });
  });

  describe("cost control", () => {
    it("each explicit update is exactly one Places search and no model call", async () => {
      searchNearby.mockResolvedValue([place("a")]);
      expect(searchNearby).not.toHaveBeenCalled();
      await request({ context: { ...CONTEXT, meal_budget: "under_15" }, location: LOCATION });
      expect(searchNearby).toHaveBeenCalledTimes(1);
      await request({ context: { ...CONTEXT, meal_budget: "25_to_40", travel_willingness: "nearby" }, location: LOCATION });
      expect(searchNearby).toHaveBeenCalledTimes(2);
      expect(generate).not.toHaveBeenCalled();
    });

    it("a failed search is not retried automatically", async () => {
      searchNearby.mockRejectedValue(new PlacesError("request_failed", "HTTP 500"));
      await request({ context: CONTEXT, location: LOCATION });
      expect(searchNearby).toHaveBeenCalledTimes(1);
    });
  });
});

describe("POST /api/recommend — nearby: per-user place feedback", () => {
  const feedback = (place_id: string, action: "exclude" | "downrank", user_id = "user-1"): FeedbackRow => ({
    user_id,
    provider: "google_places",
    place_id,
    action,
  });
  const picked = async () =>
    ((await (await request({ context: CONTEXT, location: LOCATION })).json()).recommendations as { place_id: string }[]).map((r) => r.place_id);

  beforeEach(() => {
    searchNearby.mockResolvedValue([place("a"), place("b"), place("c"), place("d")]);
  });

  it("a fresh user (no feedback) is unaffected", async () => {
    expect((await picked()).sort()).toHaveLength(3);
  });

  it("a hard-excluded place is never picked, on a fresh search or \"Show me 3 more\"", async () => {
    feedbackRows = [feedback("b", "exclude")];
    expect(await picked()).not.toContain("b");
    const more = await request({ context: CONTEXT, location: LOCATION, previous_recommendations: [] });
    expect(JSON.stringify(await more.json())).not.toContain('"place_id":"b"');
  });

  it("the exclusion is keyed by place id, not name: a same-named place with another id still appears", async () => {
    searchNearby.mockResolvedValue([place("a", { name: "Chain" }), place("a2", { name: "Chain" }), place("c")]);
    feedbackRows = [feedback("a", "exclude")];
    expect((await picked()).sort()).toEqual(["a2", "c"]);
  });

  it("a closed/exclude report is specific to the user who made it", async () => {
    feedbackRows = [feedback("b", "exclude", "user-2")];
    expect(await picked()).toContain("b"); // user-1
    currentUser = "user-2";
    expect(await picked()).not.toContain("b");
  });

  it("another provider's ids never collide with Google place ids", async () => {
    feedbackRows = [{ ...feedback("b", "exclude"), provider: "other_provider" }];
    expect(await picked()).toContain("b");
  });

  it("a soft-downranked place stays eligible but is not the best match", async () => {
    searchNearby.mockResolvedValue([place("a"), place("b")]);
    feedbackRows = [feedback("a", "downrank")]; // a is also the nearest
    const ids = await picked();
    expect(ids).toContain("a");
    expect(ids[0]).toBe("b");
  });

  it("never writes feedback as a side effect of reading it", async () => {
    feedbackRows = [feedback("b", "exclude")];
    await request({ context: { ...CONTEXT, travel_willingness: "walkable" }, location: LOCATION });
    expect(feedbackRows).toHaveLength(1);
  });

  it("a failed feedback read degrades to no feedback instead of failing the request", async () => {
    feedbackRows = null as never; // makes the fake throw
    const res = await request({ context: CONTEXT, location: LOCATION });
    expect(res.status).toBe(200);
    expect(await picked()).toContain("b");
  });
});

describe("POST /api/recommend — nearby: saved state comes back with the set", () => {
  it("marks places already in the user's Saved, read once for the whole set", async () => {
    searchNearby.mockResolvedValue([place("a"), place("b"), place("c")]);
    savedPlaceIds = ["b", "not-in-this-set"];
    const body = await (await request({ context: CONTEXT, location: LOCATION })).json();
    expect(body.saved).toEqual({ recipeIndexes: [], placeIds: ["b"] });
  });

  it("a fresh user gets an empty saved state", async () => {
    searchNearby.mockResolvedValue([place("a")]);
    const body = await (await request({ context: CONTEXT, location: LOCATION })).json();
    expect(body.saved).toEqual({ recipeIndexes: [], placeIds: [] });
  });
});
