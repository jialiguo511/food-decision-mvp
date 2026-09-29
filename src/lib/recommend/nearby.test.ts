import { describe, expect, it } from "vitest";
import type { PlaceCandidate } from "../places/candidates";
import type { ProfileInput, OrderContext } from "../types";
import { DEFAULT_PROFILE } from "../options";
import { recommendRequestSchema, resolveNearbyInput } from "./input";
import { expectedNearbyCount, findFabricatedMenuClaims, parseNearbyRecommendations } from "./output";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { parseStoredSession } from "./session";

function candidate(id: string, overrides: Partial<PlaceCandidate> = {}): PlaceCandidate {
  return {
    id,
    name: `Place ${id}`,
    category: "Restaurant",
    primary_type: "restaurant",
    address: `${id} Main St`,
    location: { latitude: 37.78, longitude: -122.41 },
    operational: true,
    open_now: true,
    price_level: null,
    maps_url: `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
    distance_m: 400,
    ...overrides,
  };
}

const CANDIDATES = [candidate("a"), candidate("b"), candidate("c"), candidate("d")];
const many = (n: number) => Array.from({ length: n }, (_, i) => candidate(`p${i}`));

const pick = (place_id: string) => ({ place_id, reason: "Close by and filling.", look_for: "A rice bowl style option, if they have one." });

function raw(best: unknown, easy: unknown, alt: unknown) {
  return JSON.stringify({ best_match: best, lowest_effort: easy, alternative: alt });
}

describe("parseNearbyRecommendations", () => {
  it("builds recommendations from the candidates, not from anything the model wrote", () => {
    const result = parseNearbyRecommendations(raw(pick("a"), pick("b"), pick("c")), CANDIDATES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recommendations).toHaveLength(3);
    expect(result.recommendations[0]).toMatchObject({
      decision_mode: "nearby",
      role: "best_match",
      title: "Place a",
      place_id: "a",
      distance_m: 400,
      maps_url: "https://www.google.com/maps/search/?api=1&query_place_id=a",
      address: "a Main St",
    });
    expect(result.recommendations.map((r) => r.role)).toEqual(["best_match", "lowest_effort", "alternative"]);
  });

  it("rejects a place_id that is not in this request's candidates (invented place)", () => {
    const result = parseNearbyRecommendations(raw(pick("a"), pick("ChIJ-made-up"), pick("c")), CANDIDATES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("malformed_output");
    expect(result.details.join(" ")).toContain("lowest_effort");
    expect(result.details.join(" ")).toContain("not one of this request's candidates");
  });

  it("rejects the whole set when even one pick is unknown — no partial rendering", () => {
    expect(parseNearbyRecommendations(raw(pick("a"), pick("b"), pick("zzz")), CANDIDATES).ok).toBe(false);
  });

  it("rejects the same place recommended twice", () => {
    const result = parseNearbyRecommendations(raw(pick("a"), pick("a"), pick("b")), CANDIDATES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.join(" ")).toContain("repeats a place");
  });

  it("rejects malformed JSON and wrong shapes", () => {
    expect(parseNearbyRecommendations("not json", CANDIDATES)).toMatchObject({ ok: false, code: "malformed_output" });
    expect(parseNearbyRecommendations(JSON.stringify({ best_match: pick("a") }), CANDIDATES).ok).toBe(false);
    expect(
      parseNearbyRecommendations(raw({ place_id: "a", reason: "", look_for: "x" }, pick("b"), pick("c")), CANDIDATES).ok,
    ).toBe(false);
  });

  it.each([
    ["a price", "Order the bowl for $13.95."],
    ["a price", "About 14 dollars."],
    ["a calorie count", "Around 650 calories."],
    ["a calorie count", "~550 kcal."],
    ["a macro amount", "Packs 40g protein."],
    ["a quoted (menu-item-style) name", 'Try their "Spicy Chicken Power Bowl".'],
  ])("rejects text that fabricates %s", (_what, text) => {
    const result = parseNearbyRecommendations(
      raw({ ...pick("a"), look_for: text }, pick("b"), pick("c")),
      CANDIDATES,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.join(" ")).toContain("places data can't support");
  });

  it("also checks the reason, not just look_for", () => {
    const result = parseNearbyRecommendations(
      raw({ ...pick("a"), reason: "Only $9 for a big plate." }, pick("b"), pick("c")),
      CANDIDATES,
    );
    expect(result.ok).toBe(false);
  });
});

describe("exactly-3 enforcement", () => {
  it("expects min(3, candidates)", () => {
    expect([0, 1, 2, 3, 4, 10].map(expectedNearbyCount)).toEqual([0, 1, 2, 3, 3, 3]);
  });

  it("10 candidates, model returns only 2 (one slot null) → rejected", () => {
    const result = parseNearbyRecommendations(raw(pick("p0"), null, pick("p1")), many(10));
    expect(result.ok).toBe(false);
  });

  it("2 candidates, model returns only 1 → rejected by the count rule (nullable slots can't be used to under-return)", () => {
    const result = parseNearbyRecommendations(raw(pick("p0"), null, null), many(2));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.details.join(" ")).toContain("were required");
  });

  it("10 candidates, model returns 3 → accepted", () => {
    const result = parseNearbyRecommendations(raw(pick("p0"), pick("p1"), pick("p2")), many(10));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.recommendations).toHaveLength(3);
  });

  it("exactly 3 candidates → all three slots are required", () => {
    const three = many(3);
    expect(parseNearbyRecommendations(raw(pick("p0"), pick("p1"), pick("p2")), three).ok).toBe(true);
    expect(parseNearbyRecommendations(raw(pick("p0"), pick("p1"), null), three).ok).toBe(false);
    expect(parseNearbyRecommendations(raw(null, null, null), three).ok).toBe(false);
  });

  it("only 2 candidates → 2 is allowed, and both must be returned", () => {
    const two = many(2);
    const ok = parseNearbyRecommendations(raw(pick("p0"), null, pick("p1")), two);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.recommendations).toHaveLength(2);
    expect(parseNearbyRecommendations(raw(pick("p0"), pick("p1"), null), two).ok).toBe(true);
    expect(parseNearbyRecommendations(raw(pick("p0"), null, null), two).ok).toBe(false);
  });

  it("only 2 candidates, model tries a third (unknown) place → rejected, never padded", () => {
    expect(parseNearbyRecommendations(raw(pick("p0"), pick("p1"), pick("invented")), many(2)).ok).toBe(false);
  });

  it("1 candidate → exactly that one", () => {
    const result = parseNearbyRecommendations(raw(pick("p0"), null, null), many(1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendations.map((r) => (r.decision_mode === "nearby" ? r.place_id : null))).toEqual(["p0"]);
  });

  it("'Show me 3 more' with only 2 unused candidates left returns those 2", () => {
    // The route removes already-shown places before this point (see the route
    // test); what remains is the candidate list, so the rule is the same as
    // any two-candidate request.
    expect(parseNearbyRecommendations(raw(pick("p3"), null, pick("p4")), many(5).slice(3)).ok).toBe(true);
  });

  it("no candidates → only an empty result is acceptable", () => {
    expect(parseNearbyRecommendations(raw(null, null, null), []).ok).toBe(true);
    expect(parseNearbyRecommendations(raw(pick("a"), null, null), []).ok).toBe(false);
  });

  it("duplicate ids are still rejected when the count is right", () => {
    expect(parseNearbyRecommendations(raw(pick("p0"), pick("p0"), pick("p1")), many(10)).ok).toBe(false);
  });
});

describe("findFabricatedMenuClaims", () => {
  it("accepts strategy-style guidance", () => {
    expect(findFabricatedMenuClaims("A grilled chicken or rice-bowl style option, with vegetables if they have them.")).toEqual([]);
    expect(findFabricatedMenuClaims("Close by — about 0.4 mi away, and likely open.")).toEqual([]);
    expect(findFabricatedMenuClaims("Good for a warm, filling dinner.")).toEqual([]);
  });
});

describe("resolveNearbyInput", () => {
  const profile: ProfileInput = { ...DEFAULT_PROFILE, dislikes: ["Pork"], cuisines: ["Thai"] };
  const context: OrderContext = {
    decision_mode: "order",
    hunger: "very_hungry",
    craving_category: "meaty",
    craving_note: "shawarma",
    method: "eat_nearby",
    meal_budget: "no_preference",
    travel_willingness: "no_preference",
    nearby: true,
  };

  it("treats disliked foods as a soft preference — never as a hard constraint", () => {
    const input = resolveNearbyInput(profile, context, [candidate("a")]);
    // No allergy/dietary field exists yet, so nothing is stated as hard.
    expect(input.hard_constraints).toEqual({ decision_mode: "nearby" });
    expect(JSON.stringify(input.hard_constraints)).not.toContain("Pork");
    expect(input.soft_preferences.disliked_foods).toEqual(["Pork"]);
  });

  it("the prompt frames dislikes as soft and states there is no allergy data", () => {
    const prompt = buildSystemPrompt(resolveNearbyInput(profile, context, CANDIDATES));
    expect(prompt).toContain("strong negative signal, not a safety rule");
    expect(prompt).toContain("not an absolute exclusion");
    expect(prompt).toContain("NO allergy or dietary-restriction data");
    // The old hard-constraint wording is gone.
    expect(prompt).not.toContain("hard_constraints.avoid");
    expect(prompt).not.toContain("non-negotiable");
    expect(prompt).toContain("exactly three");
  });

  it("sends only the model-relevant candidate facts", () => {
    const input = resolveNearbyInput(profile, context, [candidate("a", { open_now: false as never, price_level: "moderate" })]);
    expect(input.soft_preferences.craving_note).toBe("shawarma");
    expect(input.soft_preferences.preferred_cuisines).toEqual(["Thai"]);
    expect(input.candidates).toEqual([
      // open_now is only ever true or null for the model; price is passed through.
      { place_id: "a", name: "Place a", category: "Restaurant", distance_m: 400, open_now: null, price_level: "moderate", feasibility: "ok", budget_fit: null },
    ]);
  });

  it("never puts coordinates, addresses, or links in what the model sees", () => {
    const message = buildUserMessage(resolveNearbyInput(profile, context, CANDIDATES));
    expect(message).not.toContain("37.78");
    expect(message).not.toContain("latitude");
    expect(message).not.toContain("maps");
    expect(message).not.toContain("Main St");
  });

  it("builds a system prompt that states the anti-hallucination and menu rules", () => {
    const prompt = buildSystemPrompt(resolveNearbyInput(profile, context, CANDIDATES));
    expect(prompt).toContain("ONLY places from `candidates`");
    expect(prompt).toContain("Never invent");
    expect(prompt).toContain("no menu, no prices");
    expect(prompt).toContain(`"The probability that the user will actually eat this meal tonight`);
  });
});

describe("recommendRequestSchema (nearby)", () => {
  const base = {
    decision_mode: "order",
    hunger: "normal",
    craving_category: "no_preference",
    craving_note: null,
    method: "eat_nearby",
    meal_budget: "no_preference",
  };

  it("accepts a nearby context with a location", () => {
    const parsed = recommendRequestSchema.safeParse({
      context: { ...base, nearby: true },
      location: { latitude: 37.78, longitude: -122.41 },
    });
    expect(parsed.success).toBe(true);
  });

  it("still accepts the category flow with no nearby flag and no location", () => {
    expect(recommendRequestSchema.safeParse({ context: base }).success).toBe(true);
  });

  it("rejects out-of-range or non-numeric coordinates", () => {
    for (const location of [
      { latitude: 91, longitude: 0 },
      { latitude: 0, longitude: 181 },
      { latitude: "1", longitude: 0 },
    ]) {
      expect(recommendRequestSchema.safeParse({ context: { ...base, nearby: true }, location }).success).toBe(false);
    }
  });
});

describe("stored nearby sessions", () => {
  const stored = {
    decision_mode: "nearby",
    role: "best_match",
    title: "Place a",
    place_id: "a",
    reason: "Close by.",
    look_for: "A bowl.",
    category: "Restaurant",
    address: "1 Main St",
    distance_m: 400,
    open_now: true,
    price_level: null,
    maps_url: "https://www.google.com/maps/search/?api=1&query_place_id=a",
  };
  const context = {
    decision_mode: "order",
    hunger: "normal",
    craving_category: "no_preference",
    craving_note: null,
    method: "eat_nearby",
    meal_budget: "no_preference",
    nearby: true,
  };

  it("restores a nearby session, including which place was chosen", () => {
    const restored = parseStoredSession({ id: "s1", chosen_index: 0, context, recommendations: [stored] });
    expect(restored?.chosenIndex).toBe(0);
    expect(restored?.session.recommendations[0]).toMatchObject({ decision_mode: "nearby", place_id: "a" });
    expect(restored?.session.context).toMatchObject({ nearby: true });
  });

  it("restores a nearby session with zero results", () => {
    expect(parseStoredSession({ id: "s1", chosen_index: null, context, recommendations: [] })?.session.recommendations).toEqual([]);
  });

  it("discards a stored row whose link isn't https (it would be rendered as an href)", () => {
    for (const maps_url of ["javascript:alert(1)", "http://insecure.example/x", "not a url"]) {
      expect(parseStoredSession({ id: "s1", chosen_index: null, context, recommendations: [{ ...stored, maps_url }] })).toBeNull();
    }
  });

  it("stores no coordinates: a nearby session row has nothing but the flag and approximate distances", () => {
    const row = JSON.stringify({ context, recommendations: [stored] });
    expect(row).not.toMatch(/latitude|longitude/);
  });

  it("still restores an order session saved before the nearby flag existed", () => {
    const { nearby: _nearby, ...legacy } = context;
    void _nearby;
    expect(parseStoredSession({ id: "s1", chosen_index: null, context: legacy, recommendations: [] })).not.toBeNull();
  });
});
