// The cross-way ("open") request: what the recommender is given, what it may return,
// and what must hold on every card whatever its way. One call, up to three cards,
// each a recipe, a food idea to order, or a snack to grab.

import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import type { OpenContext, ProfileInput } from "@/lib/types";
import { buildOpenOutputSchema, findConstraintViolations, parseRecommendations } from "./output";
import { openContextSchema, resolveRecommendationInput, type OpenRecommendationInput } from "./input";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

const OPEN: OpenContext = {
  decision_mode: "open",
  hunger: "normal",
  ways: { cook: true, buy: true },
  minutes: null,
  effort: null,
  extra_spend_usd: null,
  meal_budget: "no_preference",
  ingredients_on_hand: [],
  craving: null,
  after_exercise: false,
  protein_focus: false,
  easy_pick: false,
};
const NO_EQUIPMENT: ProfileInput = { ...DEFAULT_PROFILE, equipment: [] };
const input = (o: Partial<OpenContext> = {}, profile: ProfileInput = DEFAULT_PROFILE, staples: string[] = []) =>
  resolveRecommendationInput(profile, { ...OPEN, ...o }, undefined, staples) as OpenRecommendationInput;

const cook = (o: Record<string, unknown> = {}) => ({
  way: "cook", title: "Tuna wrap", reason: "Light and quick.", estimated_minutes: 10, estimated_meal_cost_usd: 4, estimated_extra_cost_usd: 4, estimated_calories: 400, estimated_protein_g: 30,
  watch: null, ingredients_on_hand: [], ingredients_needed: ["canned tuna", "tortilla"], equipment: [], steps: ["Drain the tuna.", "Wrap it."], inventory_note: null, image_query: "tuna wrap", ...o,
});
const idea = (o: Record<string, unknown> = {}) => ({
  way: "order", title: "Chicken rice bowl", reason: "Filling.", search_terms: ["chicken bowl"], order_notes: "Ask for extra chicken.", modification: null, watch: null, estimated_calories: 600, estimated_protein_g: 40, ...o,
});
const snack = (o: Record<string, unknown> = {}) => ({
  way: "store_snack", title: "Greek yogurt cup", reason: "Easy protein.", what_to_look_for: "Single-serve plain Greek yogurt.", backup: null, watch: null, estimated_calories: 150, estimated_protein_g: 15, ...o,
});
const set = (a: object, b: object, c: object) => JSON.stringify({ best_match: a, lowest_effort: b, alternative: c });
const parse = (text: string, i: OpenRecommendationInput = input()) => parseRecommendations(text, i.hard_constraints);

describe("what the recommender is given", () => {
  it("equipment is the same hard constraint as everywhere: unknown means no appliance", () => {
    expect(input({}, NO_EQUIPMENT).hard_constraints.cook).toMatchObject({ equipment: [], equipment_known: false, no_cooking: true });
    expect(input({}, DEFAULT_PROFILE).hard_constraints.cook).toMatchObject({ equipment: ["Stovetop", "Microwave"], equipment_known: true, no_cooking: false });
  });

  it("time and purchase ceiling are the person's words from THIS sentence — never a Profile default or a system number", () => {
    const none = input({}, { ...DEFAULT_PROFILE, budget_per_meal_usd: null, default_cook_minutes: 45 });
    expect(none.hard_constraints.cook).toMatchObject({ max_minutes: null, budget_usd: null });
    expect(input({ minutes: 15, extra_spend_usd: 6 }).hard_constraints.cook).toMatchObject({ max_minutes: 15, budget_usd: 6 });
    // an explicit Profile budget is the person's own and may stand in for a purchase ceiling they didn't restate
    expect(input({}, { ...DEFAULT_PROFILE, budget_per_meal_usd: 8 }).hard_constraints.cook?.budget_usd).toBe(8);
  });

  it("no cooking: no cook limits at all, and no Kitchen staples are offered", () => {
    const i = input({ ways: { cook: false, buy: true } }, DEFAULT_PROFILE, ["Salt", "Soy sauce"]);
    expect(i.hard_constraints.cook).toBeNull();
    expect(i.soft_preferences.ingredients_on_hand).toEqual([]);
  });

  it("on-hand foods are ONLY what was named plus Kitchen staples — unknown is not 'none'", () => {
    expect(input({}, DEFAULT_PROFILE, ["Salt"]).soft_preferences.ingredients_on_hand).toEqual(["Salt"]);
    expect(input({ ingredients_on_hand: ["eggs"] }, DEFAULT_PROFILE, ["Salt"]).soft_preferences.ingredients_on_hand).toEqual(["eggs", "Salt"]);
  });

  it("allergies and the dietary pattern travel for every way", () => {
    const i = input({}, { ...DEFAULT_PROFILE, allergies: ["Peanuts"], dietary_patterns: ["vegetarian"] });
    expect(i.hard_constraints).toMatchObject({ allergies: ["Peanuts"], dietary: { patterns: ["vegetarian"] } });
  });

  it("the person's situation travels as their own words, not a measurement", () => {
    const i = input({ after_exercise: true, protein_focus: true });
    expect(i.soft_preferences.situation).toEqual({ after_exercise: true, wants_more_protein: true });
    expect(JSON.stringify(i)).not.toMatch(/deficit|shortfall|missing|gap/i);
  });
});

describe("the open context schema", () => {
  it("accepts a normal cross-way request and refuses one that allows nothing", () => {
    expect(openContextSchema.safeParse(OPEN).success).toBe(true);
    expect(openContextSchema.safeParse({ ...OPEN, ways: { cook: false, buy: false } }).success).toBe(false);
  });
  it("refuses an out-of-range or free-form field", () => {
    expect(openContextSchema.safeParse({ ...OPEN, minutes: 2 }).success).toBe(false);
    expect(openContextSchema.safeParse({ ...OPEN, extra_spend_usd: -1 }).success).toBe(false);
    expect(openContextSchema.safeParse({ ...OPEN, ingredients_on_hand: Array.from({ length: 41 }, () => "x") }).success).toBe(false);
  });
});

describe("the prompt", () => {
  it("states which ways are allowed, and forbids a recipe when cooking is ruled out", () => {
    const p = buildSystemPrompt(input({ ways: { cook: false, buy: true } }));
    expect(p).toMatch(/NOT ALLOWED here: the user does not want to cook/);
    expect(p).toContain("order, store_snack");
    expect(buildSystemPrompt(input())).not.toMatch(/NOT ALLOWED here: the user does not want to cook/);
  });

  it("forbids inventing a kitchen, a place or a price, and treats null as unknown", () => {
    const p = buildSystemPrompt(input());
    expect(p).toMatch(/NOT said|were NOT SAID/i);
    expect(p).toMatch(/Never name a restaurant, store, chain or place/);
    expect(p).toMatch(/Never state a price/);
    expect(p).toMatch(/Assume only water beyond that list/);
  });

  it("a self-reported protein wish is never a measured shortfall", () => {
    const p = buildSystemPrompt(input({ protein_focus: true, after_exercise: true }));
    expect(p).toMatch(/NOT something the app has measured/);
    expect(p).toMatch(/NEVER say or imply they are low, short or deficient in protein/);
    expect(p).toMatch(/never make a medical or recovery claim/);
  });

  it("'easy pick' makes every option low-burden; a light appetite means a small portion", () => {
    expect(buildSystemPrompt(input({ easy_pick: true }))).toMatch(/Every option must be very low burden/);
    expect(buildSystemPrompt(input({ hunger: "light" }))).toMatch(/small portion/);
  });

  it("keeps the allergy and diet rules, and the no-cooking assembly rule when equipment is unknown", () => {
    const withRules = buildSystemPrompt(input({}, { ...NO_EQUIPMENT, allergies: ["Peanuts"], dietary_patterns: ["vegan"] }));
    expect(withRules).toContain("a safety constraint, never a preference");
    expect(withRules).toContain("vegan (no animal products");
    expect(withRules).toMatch(/No cooking at all/);
  });

  it("is ONE request carrying every allowed way — not three prompts", () => {
    expect(buildUserMessage(input())).toContain('"decision_mode":"open"');
  });
});

describe("what it may return", () => {
  it("accepts a mixed set — a recipe, a food idea and a snack — and tags each card with its own mode", () => {
    const r = parse(set(cook(), snack(), idea()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.recommendations.map((x) => [x.role, x.decision_mode])).toEqual([["best_match", "cook"], ["lowest_effort", "store_snack"], ["alternative", "order"]]);
  });

  it("is exactly three: a missing slot is malformed, never padded", () => {
    expect(parse(JSON.stringify({ best_match: cook(), lowest_effort: snack() })).ok).toBe(false);
  });

  it("every card needs a way, and only a way that is allowed", () => {
    expect(parse(set({ ...cook(), way: undefined }, snack(), idea())).ok).toBe(false);
    expect(parse(set(cook(), snack(), idea({ way: "nearby" }))).ok).toBe(false);
  });

  it("when cooking is ruled out a recipe can't even be expressed — and is rejected if it somehow arrives", () => {
    const i = input({ ways: { cook: false, buy: true } });
    expect(parse(set(cook(), snack(), idea()), i).ok).toBe(false);
    expect(buildOpenOutputSchema({ cook: false, buy: true }).safeParse(JSON.parse(set(cook(), snack(), idea()))).success).toBe(false);
    expect(parse(set(idea({ title: "A" }), snack(), idea({ title: "B" })), i).ok).toBe(true);
  });

  it("the three must be different options", () => {
    expect(parse(set(snack(), snack(), idea())).ok).toBe(false);
  });
});

describe("every card is held to its own way's rules", () => {
  it("an allergen in ANY way is rejected — recipe, food idea or snack", () => {
    const i = input({}, { ...DEFAULT_PROFILE, allergies: ["Peanuts"] });
    for (const bad of [
      set(cook({ title: "Peanut noodle bowl" }), snack(), idea()),
      set(cook(), snack({ what_to_look_for: "Peanut butter cups" }), idea()),
      set(cook(), snack(), idea({ search_terms: ["peanut sauce noodles"] })),
    ]) {
      const r = parse(bad, i);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("constraint_violation");
    }
  });

  it("with unknown equipment a recipe must be a no-heat assembly; a hot step is rejected", () => {
    const i = input({}, NO_EQUIPMENT);
    expect(parse(set(cook(), snack(), idea()), i).ok).toBe(true);
    const hot = parse(set(cook({ steps: ["Heat the pan.", "Fry the tuna."], title: "Seared tuna" }), snack(), idea()), i);
    expect(hot.ok).toBe(false);
  });

  it("equipment the person doesn't have can't appear in a recipe", () => {
    const r = parse(set(cook({ equipment: ["Air fryer"], steps: ["Air fry it."] }), snack(), idea()), input({}, DEFAULT_PROFILE));
    expect(r.ok).toBe(false);
  });

  it("a stated time limit binds recipes; an unstated one is NOT invented", () => {
    const slow = set(cook({ estimated_minutes: 40 }), snack(), idea());
    expect(parse(slow, input({ minutes: 15 }, DEFAULT_PROFILE)).ok).toBe(false);
    expect(parse(slow, input({}, DEFAULT_PROFILE)).ok).toBe(true); // nothing was said, so nothing is enforced
  });

  it("a stated purchase ceiling binds recipes; an unstated one is not invented", () => {
    const dear = set(cook({ estimated_extra_cost_usd: 30 }), snack(), idea());
    expect(parse(dear, input({ extra_spend_usd: 8 }, { ...DEFAULT_PROFILE, budget_per_meal_usd: null })).ok).toBe(false);
    expect(parse(dear, input({}, { ...DEFAULT_PROFILE, budget_per_meal_usd: null })).ok).toBe(true);
  });

  it("the dietary pattern holds for a recipe", () => {
    const r = parse(set(cook({ title: "Chicken wrap", ingredients_needed: ["chicken"], steps: ["Wrap the chicken."] }), snack(), idea()), input({}, { ...DEFAULT_PROFILE, dietary_patterns: ["vegetarian"] }));
    expect(r.ok).toBe(false);
  });

  it("findConstraintViolations names the way it objects to", () => {
    const cooks = [{ decision_mode: "cook" as const, role: "best_match" as const, ...cook() }] as never;
    const v = findConstraintViolations(cooks, input({ ways: { cook: false, buy: true } }).hard_constraints);
    expect(v.join(" ")).toMatch(/doesn't want to cook/);
  });
});
