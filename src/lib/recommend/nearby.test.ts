import { describe, expect, it } from "vitest";
import type { PlaceCandidate } from "../places/candidates";
import type { ProfileInput, OrderContext } from "../types";
import { DEFAULT_PROFILE } from "@/test/profileInput";
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
    website_url: null,
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

  it("copies the website from the candidate (null when the place has none) and never from the model", () => {
    const withSite = [candidate("a", { website_url: "https://a.example/" }), candidate("b"), candidate("c")];
    const result = parseNearbyRecommendations(
      raw({ ...pick("a"), website_url: "https://evil.example/" }, pick("b"), pick("c")),
      withSite,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recommendations.map((r) => (r as { website_url: string | null }).website_url)).toEqual([
      "https://a.example/",
      null,
      null,
    ]);
  });

  it("works for a restaurant with limited metadata (no category, price, address, website)", () => {
    const bare = [
      candidate("a", { category: null, primary_type: null, address: null, price_level: null, open_now: null, location: null, distance_m: null }),
      candidate("b"),
      candidate("c"),
    ];
    const result = parseNearbyRecommendations(raw(pick("a"), pick("b"), pick("c")), bare);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recommendations[0]).toMatchObject({ category: null, address: null, distance_m: null, price_level: null, website_url: null });
  });

  describe("allergy validation (second layer behind the prompt)", () => {
    const peanut = { ...pick("a"), look_for: "A peanut noodle bowl, sauce on the side." };
    const safe = pick("b");
    const lookFor = (r: ReturnType<typeof parseNearbyRecommendations>, i: number) =>
      r.ok ? (r.recommendations[i] as { look_for: string | null }).look_for : "rejected";
    const parse = (a: unknown, allergies: string[]) => parseNearbyRecommendations(raw(a, safe, pick("c")), CANDIDATES, allergies);

    it("peanut allergy + peanut in look_for → guidance withheld, place kept", () => {
      const result = parse(peanut, ["Peanuts"]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.recommendations[0]).toMatchObject({ place_id: "a", title: "Place a", look_for: null, maps_url: expect.any(String) });
      // Only the conflicting one is withheld.
      expect(lookFor(result, 1)).toBe(safe.look_for);
    });

    it("an unrelated allergy leaves safe guidance untouched", () => {
      const result = parse(pick("a"), ["Dairy", "Shellfish"]);
      expect(lookFor(result, 0)).toBe(pick("a").look_for);
    });

    it("no allergy profile behaves exactly as before", () => {
      for (const allergies of [[], undefined]) {
        const result = parseNearbyRecommendations(raw(peanut, safe, pick("c")), CANDIDATES, allergies);
        expect(lookFor(result, 0)).toBe(peanut.look_for);
      }
    });

    it("shellfish allergy matches the word 'shellfish' but — with no alias table — not 'shrimp'", () => {
      const shellfish = (look_for: string) => lookFor(parse({ ...pick("a"), look_for }, ["Shellfish"]), 0);
      expect(shellfish("Any shellfish dish, lightly cooked.")).toBeNull();
      expect(shellfish("A shrimp rice bowl.")).toBe("A shrimp rice bowl.");
    });

    it("a reason that names an allergen rejects the set (it can't be withheld per card)", () => {
      const result = parse({ ...pick("a"), reason: "Known for its peanut sauces." }, ["Peanuts"]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.details.join(" ")).toContain("reason names one of the user's allergens");
    });
  });

  it("rejects a named-and-quoted menu item in look_for even with the richer guidance", () => {
    const quoted = { ...pick("a"), look_for: 'Order the "Power Bowl", sauce on the side.' };
    expect(parseNearbyRecommendations(raw(quoted, pick("b"), pick("c")), CANDIDATES).ok).toBe(false);
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
    // Dislikes are never hard; the only hard constraint is allergies (none here).
    expect(input.hard_constraints).toEqual({ decision_mode: "nearby", allergies: [], dietary: { patterns: [], other: null } });
    expect(JSON.stringify(input.hard_constraints)).not.toContain("Pork");
    expect(input.soft_preferences.disliked_foods).toEqual(["Pork"]);
  });

  it("states allergies as a hard constraint, separately from dislikes", () => {
    const withAllergy: ProfileInput = { ...profile, allergies: ["Shellfish"] };
    const input = resolveNearbyInput(withAllergy, context, [candidate("a")]);
    expect(input.hard_constraints).toEqual({ decision_mode: "nearby", allergies: ["Shellfish"], dietary: { patterns: [], other: null } });
    expect(input.soft_preferences.disliked_foods).toEqual(["Pork"]);
    const prompt = buildSystemPrompt(input);
    expect(prompt).toContain("safety constraint, never a preference");
    expect(prompt).toContain("Never claim or imply that any place");
  });

  it("the prompt frames dislikes as soft and never claims a place is safe", () => {
    const prompt = buildSystemPrompt(resolveNearbyInput(profile, context, CANDIDATES));
    expect(prompt).toContain("strong negative signal, not a safety rule");
    expect(prompt).toContain("not an absolute exclusion");
    expect(prompt).toContain("An empty list means none are recorded, not that the user has none");
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

  it("never sends the website to the model", () => {
    const input = resolveNearbyInput(profile, context, [candidate("a", { website_url: "https://a.example/" })]);
    expect(JSON.stringify(input)).not.toContain("a.example");
    expect(buildUserMessage(input)).not.toContain("a.example");
  });

  it("asks for a generic dish plus one tweak as guidance — never a menu item", () => {
    const prompt = buildSystemPrompt(resolveNearbyInput(profile, context, CANDIDATES));
    expect(prompt).toContain("sauce on the side");
    expect(prompt).toContain("Use generic dish descriptions only");
    expect(prompt).toContain("no item you recall from a real restaurant's menu");
    expect(prompt).toContain("never a menu item, price, or number");
  });

  it("carries the allergy list and its hard-constraint rule alongside the richer look_for guidance", () => {
    const input = resolveNearbyInput({ ...profile, allergies: ["Peanuts", "Shellfish"] }, context, CANDIDATES);
    const prompt = buildSystemPrompt(input);
    expect(input.hard_constraints).toEqual({ decision_mode: "nearby", allergies: ["Peanuts", "Shellfish"], dietary: { patterns: [], other: null } });
    expect(buildUserMessage(input)).toContain("Peanuts");
    expect(prompt).toContain("never point `look_for` at a dish that contains one");
    expect(prompt).toContain("a safety constraint, never a preference");
  });

  it("a lower-sodium priority reaches the model and is applied through the tweak, without amounts", () => {
    const input = resolveNearbyInput({ ...profile, nutrition_priorities: ["lower_sodium"] }, context, CANDIDATES);
    const prompt = buildSystemPrompt(input);
    expect(input.nutrition_priorities).toEqual(["lower_sodium"]);
    expect(prompt).toContain("Sodium:");
    expect(prompt).toContain("Follow any nutrition priorities through the tweak");
    expect(prompt).toContain('never call a food "low sodium"');
    // A user with none gets no priorities section at all.
    expect(buildSystemPrompt(resolveNearbyInput(profile, context, CANDIDATES))).not.toContain("Nutrition priorities (strong guidance)");
  });

  it("a budget-limited user's candidates carry budget_fit, and the prompt turns a poor fit into a simpler order (no prices)", () => {
    const input = resolveNearbyInput(
      profile,
      { ...context, meal_budget: "under_15" },
      [candidate("a", { price_level: "inexpensive" }), candidate("b", { price_level: "very_expensive" })],
    );
    expect(input.candidates.map((c) => c.budget_fit)).toEqual(["likely_fit", "unlikely_fit"]);
    const prompt = buildSystemPrompt(input);
    expect(prompt).toContain("a simple single main rather than add-ons, sides, or drinks");
    expect(prompt).toContain("never say a price");
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

  it("restores a session saved before website_url existed, with no website", () => {
    const restored = parseStoredSession({ id: "s1", chosen_index: null, context, recommendations: [stored] });
    expect(restored?.session.recommendations[0]).toMatchObject({ website_url: null });
  });

  it("restores a stored website, but discards a row whose website isn't http(s)", () => {
    for (const website_url of ["https://a.example/", "http://a.example/"]) {
      const restored = parseStoredSession({ id: "s1", chosen_index: null, context, recommendations: [{ ...stored, website_url }] });
      expect(restored?.session.recommendations[0]).toMatchObject({ website_url });
    }
    for (const website_url of ["javascript:alert(1)", "not a url", "data:text/html,x"]) {
      expect(parseStoredSession({ id: "s1", chosen_index: null, context, recommendations: [{ ...stored, website_url }] })).toBeNull();
    }
  });

  it("restores a row whose food guidance was withheld (look_for null)", () => {
    const restored = parseStoredSession({ id: "s1", chosen_index: null, context, recommendations: [{ ...stored, look_for: null }] });
    expect(restored?.session.recommendations[0]).toMatchObject({ decision_mode: "nearby", look_for: null });
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
