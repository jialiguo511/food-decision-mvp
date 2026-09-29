// Eat-out meal budget: total food budget for THIS meal, kept separate from
// Cook's budget (extra spend on missing ingredients). See types.ts → MealBudget.

import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, MEAL_BUDGETS } from "../options";
import type { PlaceCandidate } from "../places/candidates";
import type { MealBudget, MealContext, OrderContext, PlacePriceLevel, ProfileInput } from "../types";
import { budgetFit } from "./budget";
import { contextSchema, recommendRequestSchema, resolveNearbyInput, resolveRecommendationInput } from "./input";
import { findFabricatedMenuClaims, parseNearbyRecommendations } from "./output";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { parseStoredSession } from "./session";

const profile: ProfileInput = { ...DEFAULT_PROFILE, budget_per_meal_usd: 12 };

function orderContext(meal_budget: MealBudget, overrides: Partial<OrderContext> = {}): OrderContext {
  return {
    decision_mode: "order",
    hunger: "normal",
    craving_category: "warm_comforting",
    craving_note: null,
    method: "delivery",
    meal_budget,
    travel_willingness: "no_preference",
    ...overrides,
  };
}

function candidate(id: string, price_level: PlacePriceLevel | null): PlaceCandidate {
  return {
    id,
    name: `Place ${id}`,
    category: "Restaurant",
    primary_type: "restaurant",
    address: null,
    location: { latitude: 37.78, longitude: -122.41 },
    operational: true,
    open_now: true,
    price_level,
    maps_url: `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
    distance_m: 300,
  };
}

const cookContext: MealContext = {
  decision_mode: "cook",
  cook_minutes: 30,
  hunger: "normal",
  effort: "some",
  shopping: "can_buy",
  craving: null,
  ingredients_on_hand: ["Eggs"],
  budget_override_usd: null,
};

describe("Eat out context carries the meal budget", () => {
  it.each(MEAL_BUDGETS.map((b) => b.value))("category flow: %s reaches the model input", (band) => {
    const input = resolveRecommendationInput(profile, orderContext(band));
    if (input.decision_mode !== "order") throw new Error("expected order input");
    expect(input.soft_preferences.meal_budget).toBe(band);
    expect(buildUserMessage(input)).toContain(`"meal_budget": "${band}"`);
  });

  it("nearby flow: the same band reaches the model input", () => {
    const input = resolveNearbyInput(profile, orderContext("15_to_25", { nearby: true }), [candidate("a", "moderate")]);
    expect(input.soft_preferences.meal_budget).toBe("15_to_25");
  });

  it("an explicitly provided value must be a known band", () => {
    expect(contextSchema.safeParse(orderContext("under_15")).success).toBe(true);
    for (const bad of ["cheap", 15, null, ""]) {
      expect(contextSchema.safeParse({ ...orderContext("under_15"), meal_budget: bad }).success).toBe(false);
    }
  });

  it("a missing meal_budget (stale page, older request) means 'no preference', not an error", () => {
    const { meal_budget: _omit, ...legacy } = orderContext("under_15");
    void _omit;
    const parsed = recommendRequestSchema.safeParse({ context: legacy });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.context).toMatchObject({ decision_mode: "order", meal_budget: "no_preference" });
    // ...and it behaves exactly like an explicit "No strong preference".
    if (parsed.data.context.decision_mode !== "order") throw new Error("expected order");
    const input = resolveNearbyInput(profile, parsed.data.context, [candidate("a", "expensive")]);
    expect(input.soft_preferences.meal_budget).toBe("no_preference");
    expect(input.candidates[0].budget_fit).toBeNull();
  });

  it("offers the four bands in the UI order, with no-preference last", () => {
    expect(MEAL_BUDGETS.map((b) => b.label)).toEqual(["Under $15", "$15–25", "$25–40", "No strong preference"]);
  });
});

describe("Cook budget semantics are unchanged and separate", () => {
  it("Cook still caps only extra spend: override, else profile, else 0 for inventory-only", () => {
    const usual = resolveRecommendationInput(profile, cookContext);
    const override = resolveRecommendationInput(profile, { ...cookContext, budget_override_usd: 20 });
    const strict = resolveRecommendationInput(profile, { ...cookContext, shopping: "inventory_only", budget_override_usd: 20 });
    if (usual.decision_mode !== "cook" || override.decision_mode !== "cook" || strict.decision_mode !== "cook") {
      throw new Error("expected cook inputs");
    }
    expect(usual.hard_constraints).toMatchObject({ budget_usd: 12, budget_source: "profile" });
    expect(override.hard_constraints).toMatchObject({ budget_usd: 20, budget_source: "override" });
    expect(strict.hard_constraints).toMatchObject({ budget_usd: 0, no_shopping: true });
  });

  it("Cook input has no meal budget, and Eat out input has no Cook budget", () => {
    expect(JSON.stringify(resolveRecommendationInput(profile, cookContext))).not.toContain("meal_budget");
    const order = JSON.stringify(resolveRecommendationInput(profile, orderContext("under_15")));
    expect(order).not.toMatch(/budget_usd|budget_per_meal_usd|budget_override_usd|budget_source/);
    const nearby = JSON.stringify(resolveNearbyInput(profile, orderContext("under_15", { nearby: true }), [candidate("a", null)]));
    expect(nearby).not.toMatch(/budget_usd|budget_per_meal_usd|budget_override_usd|budget_source/);
  });

  it("the Cook prompt still describes budget as a ceiling on additional spending", () => {
    const prompt = buildSystemPrompt(resolveRecommendationInput(profile, cookContext));
    expect(prompt).toContain("ceiling on additional spending");
    expect(prompt).not.toContain("meal_budget");
  });

  it("a Cook context that sneaks in a meal budget is not changed by it", () => {
    const parsed = contextSchema.parse({ ...cookContext, meal_budget: "under_15" });
    expect(parsed).not.toHaveProperty("meal_budget");
  });
});

describe("budgetFit", () => {
  const levels: PlacePriceLevel[] = ["free", "inexpensive", "moderate", "expensive", "very_expensive"];
  const table = (band: MealBudget) => levels.map((l) => budgetFit(band, l));

  it("compares a price level with the band, coarsely", () => {
    expect(table("under_15")).toEqual(["likely_fit", "likely_fit", "may_be_over", "unlikely_fit", "unlikely_fit"]);
    expect(table("15_to_25")).toEqual(["likely_fit", "likely_fit", "likely_fit", "may_be_over", "unlikely_fit"]);
    expect(table("25_to_40")).toEqual(["likely_fit", "likely_fit", "likely_fit", "likely_fit", "may_be_over"]);
  });

  it("is no signal when there is no budget preference or no price level — never a fabricated one", () => {
    expect(table("no_preference")).toEqual([null, null, null, null, null]);
    for (const band of ["under_15", "15_to_25", "25_to_40"] as const) expect(budgetFit(band, null)).toBeNull();
  });
});

describe("nearby ranking receives price level + meal budget", () => {
  it("each candidate carries its real price level and a derived budget_fit", () => {
    const input = resolveNearbyInput(profile, orderContext("under_15", { nearby: true }), [
      candidate("cheap", "inexpensive"),
      candidate("mid", "moderate"),
      candidate("fancy", "expensive"),
      candidate("unpriced", null),
    ]);
    expect(input.candidates.map((c) => [c.place_id, c.price_level, c.budget_fit])).toEqual([
      ["cheap", "inexpensive", "likely_fit"],
      ["mid", "moderate", "may_be_over"],
      ["fancy", "expensive", "unlikely_fit"],
      ["unpriced", null, null],
    ]);
  });

  it("an unknown price level stays a valid pick: budget never excludes a place", () => {
    const candidates = [candidate("a", null), candidate("b", "very_expensive"), candidate("c", null)];
    const pick = (place_id: string) => ({ place_id, reason: "Close by.", look_for: "A rice-bowl style option." });
    const result = parseNearbyRecommendations(
      JSON.stringify({ best_match: pick("a"), lowest_effort: pick("b"), alternative: pick("c") }),
      candidates,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Stored price is the provider's level or null — nothing invented.
    expect(result.recommendations.map((r) => (r.decision_mode === "nearby" ? r.price_level : "x"))).toEqual([
      null,
      "very_expensive",
      null,
    ]);
  });

  it("the nearby prompt makes budget a soft feasibility signal, after craving/hunger and before the health goal", () => {
    const prompt = buildSystemPrompt(resolveNearbyInput(profile, orderContext("25_to_40", { nearby: true }), [candidate("a", null)]));
    const at = (needle: string) => prompt.indexOf(needle);
    expect(at("1. How likely the user is to actually go there")).toBeGreaterThan(-1);
    expect(at("4. Budget:")).toBeGreaterThan(at("3. Feasibility:"));
    expect(at("5. The health goal")).toBeGreaterThan(at("4. Budget:"));
    expect(prompt).toContain("ranking signal, not a filter");
    expect(prompt).toContain("null means the price is unknown");
    expect(prompt).toContain("neither a reason to pick a place nor to avoid it");
  });

  it("the nearby prompt forbids any price-fit claim for a place whose price level is unknown", () => {
    const prompt = buildSystemPrompt(resolveNearbyInput(profile, orderContext("under_15", { nearby: true }), [candidate("a", null)]));
    for (const word of ["cheap", "inexpensive", "affordable", "pricey", "budget-friendly", "within/over budget"]) {
      expect(prompt).toContain(word);
    }
    expect(prompt).toContain("When it is null the price is unknown");
    expect(prompt).toContain("make no price-fit claim at all");
    // A known level may still be referred to cautiously, as a tendency.
    expect(prompt).toContain("only as a tendency");
  });

  it("unknown price is passed through as unknown — the server never invents a level or a fit", () => {
    for (const band of ["under_15", "15_to_25", "25_to_40", "no_preference"] as const) {
      const [c] = resolveNearbyInput(profile, orderContext(band, { nearby: true }), [candidate("a", null)]).candidates;
      expect(c).toMatchObject({ price_level: null, budget_fit: null });
    }
  });
});

describe("category-based order mode uses the meal budget as feasibility", () => {
  const prompt = buildSystemPrompt(resolveRecommendationInput(profile, orderContext("under_15")));

  it("ranks it after the craving, hunger, and method, and before the health goal", () => {
    const at = (needle: string) => prompt.indexOf(needle);
    expect(at("3. `method`")).toBeGreaterThan(at("2. `hunger`"));
    expect(at("4. Feasibility — `meal_budget`")).toBeGreaterThan(at("3. `method`"));
    expect(at("5. The health goal")).toBeGreaterThan(at("4. Feasibility"));
    expect(prompt).toContain("never outranks the craving");
  });

  it("'No strong preference' means price is not factored in at all", () => {
    expect(prompt).toContain("`no_preference` means no budget preference: don't factor price in at all");
    const input = resolveRecommendationInput(profile, orderContext("no_preference"));
    if (input.decision_mode !== "order") throw new Error("expected order input");
    // Everything else about the request is exactly what it was before budget existed.
    expect(input.hard_constraints).toEqual({ decision_mode: "order", avoid: profile.dislikes });
    expect(input.soft_preferences).toMatchObject({ hunger: "normal", craving_category: "warm_comforting", method: "delivery" });
    expect(recommendRequestSchema.safeParse({ context: orderContext("no_preference") }).success).toBe(true);
  });
});

describe("no unsupported price claims", () => {
  it.each([
    "Stays under $15.",
    "Most mains run $15–25.",
    "Should fit your $25 budget.",
    "About 14 dollars with delivery.",
    "Under 15 bucks.",
  ])("nearby output that states a price is rejected: %s", (text) => {
    expect(findFabricatedMenuClaims(text)).toContain("a price");
    const candidates = [candidate("a", "inexpensive"), candidate("b", "inexpensive"), candidate("c", "inexpensive")];
    const ok = { place_id: "b", reason: "Close by.", look_for: "A bowl." };
    const bad = { place_id: "a", reason: text, look_for: "A bowl." };
    const result = parseNearbyRecommendations(
      JSON.stringify({ best_match: bad, lowest_effort: ok, alternative: { ...ok, place_id: "c" } }),
      candidates,
    );
    expect(result.ok).toBe(false);
  });

  it("qualitative, tendency-style budget wording is allowed", () => {
    for (const text of [
      "Usually a more budget-friendly kind of place, and close by.",
      "A lower-price option that is more likely to fit your budget.",
    ]) {
      expect(findFabricatedMenuClaims(text)).toEqual([]);
    }
  });

  it("every eat-out prompt forbids stating dollar amounts, and nearby forbids turning a level into one", () => {
    const order = buildSystemPrompt(resolveRecommendationInput(profile, orderContext("under_15")));
    const nearby = buildSystemPrompt(resolveNearbyInput(profile, orderContext("under_15", { nearby: true }), [candidate("a", null)]));
    expect(order).toContain("Never state or imply what anything costs");
    expect(order).toContain("no claim about delivery fees or a total");
    expect(nearby).toContain("never turn it into a dollar figure");
    expect(nearby).toContain("Never mention a dollar amount");
  });

  it("the model input never contains a dollar figure for a budget, only the band name", () => {
    const message = buildUserMessage(resolveRecommendationInput(profile, orderContext("under_15")));
    expect(message).toContain('"meal_budget": "under_15"');
    expect(message).not.toMatch(/\$\s?\d/);
  });
});

describe("persistence of the meal budget with the session", () => {
  const row = (context: Record<string, unknown>) => ({ id: "s1", chosen_index: null, context, recommendations: [] });
  const base = { decision_mode: "order", hunger: "normal", craving_category: "meaty", craving_note: null, method: "pickup" };

  it("restores the band the user picked", () => {
    const restored = parseStoredSession(row({ ...base, meal_budget: "25_to_40" }));
    expect(restored?.session.context).toMatchObject({ decision_mode: "order", meal_budget: "25_to_40" });
  });

  it("restores an order session saved before the budget existed as 'no preference' (no shim; the schema defaults it)", () => {
    const restored = parseStoredSession(row(base));
    expect(restored?.session.context).toMatchObject({ meal_budget: "no_preference" });
  });

  it("does not touch Cook sessions", () => {
    const restored = parseStoredSession(
      row({ ...cookContext, budget_override_usd: 8 } as unknown as Record<string, unknown>),
    );
    expect(restored?.session.context).toMatchObject({ decision_mode: "cook", budget_override_usd: 8 });
    expect(restored?.session.context).not.toHaveProperty("meal_budget");
  });
});
