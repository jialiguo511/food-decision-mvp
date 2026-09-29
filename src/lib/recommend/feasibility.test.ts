// Deterministic feasibility between Places and the model: open now, distance vs.
// how far the user would go, coarse price level vs. meal budget — all soft.

import { describe, expect, it } from "vitest";
import { SHORTLIST, TRAVEL_SEARCH } from "../places/config";
import type { PlaceCandidate } from "../places/candidates";
import { effectiveTravel, searchRadiusMeters } from "../places/travel";
import type { MealBudget, OrderContext, PlacePriceLevel, TravelWillingness } from "../types";
import { contextsEqual } from "./contextEquality";
import { assessFeasibility, distancePenalty, rankByFeasibility, shortlistCandidates } from "./feasibility";
import { DEFAULT_PROFILE } from "../options";
import { contextSchema, resolveNearbyInput } from "./input";
import { buildSystemPrompt } from "./prompt";
import { parseStoredSession } from "./session";

function place(id: string, o: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    id,
    name: `Place ${id}`,
    category: "Restaurant",
    primary_type: "restaurant",
    address: null,
    location: { latitude: 37.78, longitude: -122.41 },
    operational: true,
    open_now: true,
    price_level: null,
    maps_url: `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
    distance_m: 300,
    ...o,
  };
}

const prefs = (meal_budget: MealBudget, travel: TravelWillingness = "no_preference") => ({ meal_budget, travel });
const score = (c: PlaceCandidate, p: ReturnType<typeof prefs>) => assessFeasibility(c, p).score;

describe("travel willingness → search radius", () => {
  const order = (method: OrderContext["method"], travel_willingness: TravelWillingness) => ({ method, travel_willingness });

  it("walkable is the smallest radius, nearby is larger, worth a trip is the largest", () => {
    const [walk, near, trip] = (["walkable", "nearby", "worth_a_trip"] as const).map((t) =>
      searchRadiusMeters(order("eat_nearby", t)),
    );
    expect(walk).toBeGreaterThanOrEqual(1000);
    expect(walk).toBeLessThanOrEqual(1500);
    expect(near).toBeGreaterThanOrEqual(4000);
    expect(near).toBeLessThanOrEqual(5000);
    expect(trip).toBeGreaterThanOrEqual(10000);
    expect(trip).toBeLessThanOrEqual(12000);
    expect(walk).toBeLessThan(near);
    expect(near).toBeLessThan(trip);
  });

  it("'no strong preference' is a valid, moderate default between walkable and nearby-range choices", () => {
    const def = searchRadiusMeters(order("eat_nearby", "no_preference"));
    expect(def).toBeGreaterThan(TRAVEL_SEARCH.walkable.radius_m);
    expect(def).toBeLessThan(TRAVEL_SEARCH.worth_a_trip.radius_m);
  });

  it("delivery and pickup ignore any stored travel choice", () => {
    const def = TRAVEL_SEARCH.no_preference.radius_m;
    for (const method of ["delivery", "pickup"] as const) {
      expect(effectiveTravel(order(method, "worth_a_trip"))).toBe("no_preference");
      expect(searchRadiusMeters(order(method, "worth_a_trip"))).toBe(def);
    }
  });
});

describe("budget in the feasibility score", () => {
  it("a lower budget ranks an obviously lower-price place above an expensive one, other things equal", () => {
    const cheap = place("cheap", { price_level: "inexpensive" });
    const pricey = place("pricey", { price_level: "expensive" });
    for (const budget of ["under_15"] as const) {
      expect(score(cheap, prefs(budget))).toBeGreaterThan(score(pricey, prefs(budget)));
      expect(rankByFeasibility([pricey, cheap], prefs(budget)).map((a) => a.candidate.id)).toEqual(["cheap", "pricey"]);
    }
    // ...and a moderate budget still prefers cheap over very expensive.
    expect(score(cheap, prefs("15_to_25"))).toBeGreaterThan(score(place("v", { price_level: "very_expensive" }), prefs("15_to_25")));
  });

  it("a lower budget with a $$$ place is a negative signal; with a $ place a positive one", () => {
    const neutral = score(place("n", { price_level: null }), prefs("under_15"));
    expect(score(place("a", { price_level: "expensive" }), prefs("under_15"))).toBeLessThan(neutral);
    expect(score(place("b", { price_level: "inexpensive" }), prefs("under_15"))).toBeGreaterThan(neutral);
  });

  it("a higher budget never penalizes an inexpensive place", () => {
    for (const level of ["free", "inexpensive"] as const) {
      const c = place("c", { price_level: level });
      const unknown = place("u", { price_level: null });
      for (const budget of ["15_to_25", "25_to_40", "no_preference"] as const) {
        expect(score(c, prefs(budget))).toBeGreaterThanOrEqual(score(unknown, prefs(budget)));
        expect(assessFeasibility(c, prefs(budget)).tier).not.toBe("weak");
      }
    }
  });

  it("an unknown price level is neutral and stays eligible — for every budget", () => {
    const unknown = place("u", { price_level: null });
    for (const budget of ["under_15", "15_to_25", "25_to_40", "no_preference"] as const) {
      expect(assessFeasibility(unknown, prefs(budget)).budget).toBe(0);
      expect(shortlistCandidates([unknown, place("x", { price_level: "expensive" })], prefs(budget)).map((c) => c.id)).toContain("u");
    }
  });

  it("no budget preference gives no price signal at all", () => {
    for (const level of ["free", "inexpensive", "moderate", "expensive", "very_expensive"] as PlacePriceLevel[]) {
      expect(assessFeasibility(place("p", { price_level: level }), prefs("no_preference")).budget).toBe(0);
    }
  });

  it("budget is soft: a pricey place is never removed when there are too few alternatives", () => {
    const list = [place("a", { price_level: "very_expensive" }), place("b", { price_level: "very_expensive" }), place("c", { price_level: "expensive" })];
    expect(shortlistCandidates(list, prefs("under_15")).map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("distance in the feasibility score", () => {
  it("walkable strongly prefers close places", () => {
    const near = place("near", { distance_m: 300 });
    const far = place("far", { distance_m: 1100 });
    expect(score(near, prefs("no_preference", "walkable")) - score(far, prefs("no_preference", "walkable"))).toBeGreaterThan(2);
  });

  it("worth a trip reduces the distance penalty (same distance, smaller penalty)", () => {
    for (const d of [1500, 3000, 4500, 8000]) {
      expect(distancePenalty(d, "worth_a_trip")).toBeLessThan(distancePenalty(d, "walkable"));
      expect(distancePenalty(d, "worth_a_trip")).toBeLessThanOrEqual(distancePenalty(d, "nearby"));
    }
  });

  it("worth a trip doesn't systematically favor the closest: places inside its comfortable range tie on distance", () => {
    expect(distancePenalty(400, "worth_a_trip")).toBe(0);
    expect(distancePenalty(4500, "worth_a_trip")).toBe(0);
    // so other signals (here: a low-price bonus) decide between a near and a mid-distance place.
    const closer = place("closer", { distance_m: 300, price_level: null });
    const cheaperFarther = place("farther", { distance_m: 4000, price_level: "inexpensive" });
    expect(rankByFeasibility([closer, cheaperFarther], prefs("under_15", "worth_a_trip"))[0].candidate.id).toBe("farther");
  });

  it("...but farther is never better: past the comfortable range it only costs", () => {
    expect(distancePenalty(9000, "worth_a_trip")).toBeGreaterThan(distancePenalty(5000, "worth_a_trip"));
    expect(distancePenalty(9000, "worth_a_trip")).toBeGreaterThanOrEqual(0);
  });

  it("an unknown distance is neither near nor far (midpoint penalty)", () => {
    const { distance_weight } = TRAVEL_SEARCH.nearby;
    expect(distancePenalty(null, "nearby")).toBe(distance_weight / 2);
  });
});

describe("shortlist", () => {
  const many = (n: number, o: (i: number) => Partial<PlaceCandidate> = () => ({})) =>
    Array.from({ length: n }, (_, i) => place(`p${i}`, { distance_m: 200 + i * 100, ...o(i) }));

  it("is a diverse shortlist, not the deterministic top three", () => {
    const list = many(20, (i) => ({ primary_type: `type_${i % 7}` }));
    const shortlist = shortlistCandidates(list, prefs("no_preference", "nearby"));
    expect(shortlist).toHaveLength(SHORTLIST.size);
    expect(shortlist.length).toBeGreaterThan(3);
    expect(new Set(shortlist.map((c) => c.primary_type)).size).toBeGreaterThan(3);
  });

  it("caps how many of one kind of place lead the list, backfilling only if needed", () => {
    const list = many(12, () => ({ primary_type: "pizza_restaurant" }));
    // Only one kind exists: the cap must not shrink the list below what's available.
    expect(shortlistCandidates(list, prefs("no_preference")).length).toBe(SHORTLIST.size);
    const mixed = [...many(8, () => ({ primary_type: "pizza_restaurant" })), ...many(4, (i) => ({ primary_type: `other_${i}` })).map((c, i) => ({ ...c, id: `o${i}` }))];
    const types = shortlistCandidates(mixed, prefs("no_preference")).slice(0, 6).map((c) => c.primary_type);
    expect(types.filter((t) => t === "pizza_restaurant").length).toBeLessThanOrEqual(SHORTLIST.max_per_type + 2);
  });

  it("holds back weak places only while enough non-weak ones exist", () => {
    const weak = (id: string) => place(id, { price_level: "very_expensive", distance_m: 300 });
    const good = many(8, (i) => ({ primary_type: `t${i}`, price_level: "inexpensive" }));
    const withEnough = shortlistCandidates([...good, weak("w1"), weak("w2")], prefs("under_15"));
    expect(withEnough.map((c) => c.id)).not.toContain("w1");

    const fewGood = good.slice(0, 2);
    const kept = shortlistCandidates([...fewGood, weak("w1"), weak("w2")], prefs("under_15"));
    expect(kept.map((c) => c.id).sort()).toEqual([...fewGood.map((c) => c.id), "w1", "w2"].sort());
  });

  it("never shrinks below three when three real places exist, and never exceeds the shortlist size", () => {
    for (const n of [0, 1, 2, 3, 5, 12, 20]) {
      for (const p of [prefs("under_15", "walkable"), prefs("no_preference"), prefs("15_to_25", "worth_a_trip")]) {
        const length = shortlistCandidates(many(n), p).length;
        expect(length).toBeGreaterThanOrEqual(Math.min(n, SHORTLIST.min_non_weak));
        expect(length).toBeLessThanOrEqual(Math.min(n, SHORTLIST.size));
      }
    }
    expect(shortlistCandidates(many(2), prefs("under_15", "walkable"))).toHaveLength(2);
  });

  it("is deterministic and ordered best-feasibility first", () => {
    const list = many(15, (i) => ({ primary_type: `t${i % 5}`, price_level: i % 3 === 0 ? "expensive" : "inexpensive" }));
    const a = shortlistCandidates(list, prefs("under_15", "nearby"));
    const b = shortlistCandidates([...list].reverse(), prefs("under_15", "nearby"));
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    const scores = a.map((c) => score(c, prefs("under_15", "nearby")));
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
  });
});

describe("context changes make Nearby results stale (contextsEqual)", () => {
  const base: OrderContext = {
    decision_mode: "order",
    hunger: "normal",
    craving_category: "meaty",
    craving_note: null,
    method: "eat_nearby",
    meal_budget: "no_preference",
    travel_willingness: "nearby",
    nearby: true,
  };

  it("the same form against the session it produced is not stale (the nearby flag is not a form value)", () => {
    const { nearby: _n, ...form } = base;
    void _n;
    expect(contextsEqual(form, base)).toBe(true);
  });

  it.each([
    ["hunger", { hunger: "very_hungry" as const }],
    ["craving", { craving_category: "sweet" as const }],
    ["craving note", { craving_note: "ramen" }],
    ["meal budget", { meal_budget: "under_15" as const }],
    ["travel willingness", { travel_willingness: "walkable" as const }],
    ["method", { method: "pickup" as const }],
  ])("changing %s marks the existing results stale", (_name, change) => {
    expect(contextsEqual({ ...base, ...change }, base)).toBe(false);
  });

  it("a hidden travel value doesn't count as a change when the method isn't Eat nearby", () => {
    const pickup = { ...base, method: "pickup" as const };
    expect(contextsEqual({ ...pickup, travel_willingness: "walkable" }, pickup)).toBe(true);
  });
});

describe("persistence and backward compatibility of travel willingness", () => {
  const legacy = { decision_mode: "order", hunger: "normal", craving_category: "meaty", craving_note: null, method: "eat_nearby", meal_budget: "under_15", nearby: true };
  const row = (context: Record<string, unknown>) => ({ id: "s1", chosen_index: null, context, recommendations: [] });

  it("an old session without travel_willingness restores as 'no strong preference'", () => {
    expect(parseStoredSession(row(legacy))?.session.context).toMatchObject({ travel_willingness: "no_preference" });
  });

  it("a stored choice is restored as saved", () => {
    expect(parseStoredSession(row({ ...legacy, travel_willingness: "worth_a_trip" }))?.session.context).toMatchObject({
      travel_willingness: "worth_a_trip",
    });
  });

  it("an explicitly invalid value is still rejected", () => {
    for (const bad of ["far", 5, null]) {
      expect(contextSchema.safeParse({ ...legacy, travel_willingness: bad }).success).toBe(false);
    }
  });
});

describe("what the model is told", () => {
  const context: OrderContext = {
    decision_mode: "order",
    hunger: "normal",
    craving_category: "meaty",
    craving_note: null,
    method: "eat_nearby",
    meal_budget: "under_15",
    travel_willingness: "worth_a_trip",
    nearby: true,
  };

  it("passes travel willingness (only for Eat nearby) and a feasibility tier per candidate", () => {
    const input = resolveNearbyInput(DEFAULT_PROFILE, context, [
      place("a", { price_level: "inexpensive" }),
      place("b", { price_level: "very_expensive" }),
    ]);
    expect(input.soft_preferences.travel_willingness).toBe("worth_a_trip");
    expect(input.candidates.map((c) => c.feasibility)).toEqual(["strong", "weak"]);
    expect(resolveNearbyInput(DEFAULT_PROFILE, { ...context, method: "pickup" }, [place("a")]).soft_preferences.travel_willingness).toBe(
      "no_preference",
    );
  });

  it("the prompt: distance depends on travel_willingness, worth-a-trip isn't 'farther is better', weak is a real mismatch", () => {
    const prompt = buildSystemPrompt(resolveNearbyInput(DEFAULT_PROFILE, context, [place("a")]));
    expect(prompt).toContain("`travel_willingness`");
    expect(prompt).toContain("do NOT prefer a place merely because it is closest");
    expect(prompt).toContain("do NOT prefer one merely because it is farther either");
    expect(prompt).toContain('Treat "weak" as a real mismatch');
    expect(prompt).toContain("never use one for lowest_effort");
  });
});
