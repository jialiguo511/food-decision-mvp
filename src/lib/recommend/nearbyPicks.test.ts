import { describe, expect, it } from "vitest";
import type { PlaceCandidate } from "../places/candidates";
import { cravingMatches, CRAVING_FIT_POINTS, pickNearby, type NearbyPickPrefs } from "./nearbyPicks";
import { exclusionReason, withoutExcludedPlaces } from "./placeExclusions";

const cand = (id: string, over: Partial<PlaceCandidate> = {}): PlaceCandidate => ({
  id,
  name: `Place ${id}`,
  category: "Restaurant",
  primary_type: `type_${id}`,
  address: null,
  location: null,
  operational: true,
  open_now: true,
  price_level: null,
  maps_url: `https://maps.example/${id}`,
  website_url: null,
  distance_m: 500,
  ...over,
});
const prefs = (over: Partial<NearbyPickPrefs> = {}): NearbyPickPrefs => ({
  meal_budget: "no_preference",
  travel: "no_preference",
  craving_category: "no_preference",
  craving_note: null,
  ...over,
});

describe("pickNearby", () => {
  it("one place per role, exactly three when three or more exist, never padded below", () => {
    const four = [cand("a"), cand("b"), cand("c"), cand("d")];
    expect(pickNearby(four, prefs()).map((r) => r.role)).toEqual(["best_match", "lowest_effort", "alternative"]);
    expect(pickNearby([cand("a"), cand("b")], prefs())).toHaveLength(2);
    expect(pickNearby([cand("a")], prefs())).toHaveLength(1);
    expect(pickNearby([], prefs())).toEqual([]);
  });

  it("three different places, and the same input always gives the same picks", () => {
    const places = ["a", "b", "c", "d", "e"].map((id, i) => cand(id, { distance_m: 300 + i * 100 }));
    const first = pickNearby(places, prefs());
    expect(new Set(first.map((r) => r.place_id)).size).toBe(3);
    expect(pickNearby([...places].reverse(), prefs())).toEqual(first);
  });

  it("best match: closer, open, and within budget beats farther and over budget", () => {
    const places = [
      cand("far-pricey", { distance_m: 2800, price_level: "very_expensive" }),
      cand("near-cheap", { distance_m: 200, price_level: "inexpensive" }),
      cand("x"),
      cand("y"),
    ];
    expect(pickNearby(places, prefs({ meal_budget: "under_15", travel: "walkable" }))[0].place_id).toBe("near-cheap");
  });

  it("lowest effort is the nearest of the rest; alternative is a different kind of place", () => {
    const places = [
      cand("best", { primary_type: "burger", distance_m: 400 }),
      cand("nearest", { primary_type: "burger", distance_m: 100, open_now: null }),
      cand("same-kind", { primary_type: "burger", distance_m: 450, open_now: null }),
      cand("different", { primary_type: "ramen", distance_m: 600, open_now: null }),
    ];
    const [best, easy, alt] = pickNearby(places, prefs());
    expect(easy.place_id).toBe("nearest");
    expect(alt.place_id).toBe("different");
    expect(best.place_id).not.toBe(easy.place_id);
  });

  it("the user's own soft 'not for me' moves a place down but keeps it eligible", () => {
    const places = [cand("a", { user_downranked: true, distance_m: 100 }), cand("b", { distance_m: 200 }), cand("c", { distance_m: 300 })];
    const picks = pickNearby(places, prefs());
    expect(picks[0].place_id).not.toBe("a");
    expect(picks.map((r) => r.place_id)).toContain("a");
  });

  it("a craving nudges the ranking — it never excludes", () => {
    const places = [
      cand("burger", { name: "Big Burger", primary_type: "hamburger_restaurant", distance_m: 400 }),
      cand("dessert", { name: "Sweet Spot", primary_type: "dessert_shop", distance_m: 450 }),
      cand("x", { distance_m: 500 }),
      cand("y", { distance_m: 550 }),
    ];
    expect(pickNearby(places, prefs({ craving_category: "sweet" }))[0].place_id).toBe("dessert");
    expect(pickNearby(places, prefs({ craving_category: "meaty" }))[0].place_id).toBe("burger");
    expect(pickNearby(places, prefs({ craving_category: "sweet" })).map((r) => r.place_id)).toHaveLength(3);
    expect(CRAVING_FIT_POINTS).toBeGreaterThan(0);
  });

  it("the typed craving matches the place's name or type", () => {
    const sushi = cand("s", { name: "Sushi Zen", category: "Sushi restaurant" });
    expect(cravingMatches(sushi, "no_preference", "sushi tonight")).toBe(true);
    expect(cravingMatches(sushi, "no_preference", "burritos")).toBe(false);
    expect(cravingMatches(sushi, "no_preference", null)).toBe(false);
  });

  it("states only what the places data knows: no menu, price, calorie or dish claims", () => {
    const [r] = pickNearby([cand("a", { open_now: true, distance_m: 300 })], prefs({ craving_category: "no_preference" }));
    expect(r.reason).toMatch(/open now/);
    expect(r.reason).not.toMatch(/[$€£]\d|kcal|calorie|protein|menu/i);
    expect(r).toMatchObject({ look_for: null, enriched: false, decision_mode: "nearby" });
  });
});

describe("placeExclusions — hard constraints decide who is eligible", () => {
  const none = { allergies: [] as string[], dietary_patterns: [] as never[] };

  it("an allergy removes a place whose name or type centres on it (literal, and by a short place-type table)", () => {
    expect(exclusionReason(cand("a", { name: "Sushi Zen", category: "Sushi restaurant" }), { ...none, allergies: ["Fish"] })).toBe("allergy");
    expect(exclusionReason(cand("a", { name: "Crab Shack", category: "Seafood restaurant" }), { ...none, allergies: ["Shellfish"] })).toBe("allergy");
    expect(exclusionReason(cand("a", { name: "Peanut Hut" }), { ...none, allergies: ["Peanuts"] })).toBe("allergy");
    expect(exclusionReason(cand("a", { name: "Cold Stone Creamery", category: "Ice cream shop" }), { ...none, allergies: ["Dairy"] })).toBe("allergy");
  });

  it("matches whole words: 'nut' never fires on 'Donut'", () => {
    expect(exclusionReason(cand("a", { name: "Daily Donut", category: "Donut shop" }), { ...none, allergies: ["Tree nuts"] })).toBeNull();
  });

  it("no allergy or pattern recorded means nothing is excluded", () => {
    expect(exclusionReason(cand("a", { name: "Sushi Zen" }), none)).toBeNull();
  });

  it("a dietary pattern removes places that centre on what it excludes", () => {
    const steak = cand("a", { name: "Prime Steakhouse", category: "Steak house" });
    expect(exclusionReason(steak, { ...none, dietary_patterns: ["vegetarian"] })).toBe("dietary");
    expect(exclusionReason(steak, { ...none, dietary_patterns: ["pescatarian"] })).toBe("dietary");
    expect(exclusionReason(cand("b", { name: "Green Salad Bar" }), { ...none, dietary_patterns: ["vegan"] })).toBeNull();
    // halal / kosher sourcing can't be read from a name: nothing is inferred.
    expect(exclusionReason(steak, { ...none, dietary_patterns: ["halal"] })).toBeNull();
  });

  it("withoutExcludedPlaces keeps the rest in order", () => {
    const list = [cand("a", { name: "Sushi Zen" }), cand("b"), cand("c")];
    expect(withoutExcludedPlaces(list, { ...none, allergies: ["Fish"] }).map((c) => c.id)).toEqual(["b", "c"]);
  });
});
