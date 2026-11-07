import { describe, expect, it } from "vitest";
import { recipe } from "@/test/savedFixtures";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import { cookContext } from "@/test/cookFixtures";
import type { CookConstraints, DietaryConstraint, Recommendation } from "../types";
import { resolveRecommendationInput, resolveNearbyInput } from "./input";
import { findConstraintViolations } from "./output";
import { buildSystemPrompt } from "./prompt";
import { findDietaryViolations, findNoCookViolations, findUnownedApplianceMentions } from "./textChecks";

describe("appliance mentions in a recipe's own words", () => {
  const owned = ["Stovetop", "Rice cooker"];

  it("catches the incident: 'while the rice heats in the microwave' for someone with no microwave", () => {
    expect(findUnownedApplianceMentions("Warm the sauce while the rice heats in the microwave.", owned)).toEqual(["microwave"]);
  });

  it("allows an appliance the user owns", () => {
    expect(findUnownedApplianceMentions("Heat in the microwave for 90 seconds.", ["Microwave"])).toEqual([]);
  });

  it("with no known equipment, any named appliance is a violation — even a stovetop", () => {
    expect(findUnownedApplianceMentions("Roast in the oven, then toss in a blender.", [])).toEqual(["oven", "blender"]);
    expect(findUnownedApplianceMentions("Simmer on the stovetop.", [])).toEqual(["stovetop"]);
  });

  it("does not trip on ordinary cooking words", () => {
    expect(findUnownedApplianceMentions("Grilled chicken, pan-fried, blended smooth by hand, oven-free. Use a grill pan.", ["Stovetop"])).toEqual(["oven"]); // 'oven-free' names an oven
    expect(findUnownedApplianceMentions("Grilled chicken, pan-fried, fry in a skillet. Use a grill pan.", ["Stovetop"])).toEqual([]);
  });

  it("a toaster oven is not an oven", () => {
    expect(findUnownedApplianceMentions("Crisp in the toaster oven.", ["Toaster oven"])).toEqual([]);
    expect(findUnownedApplianceMentions("Crisp in the toaster oven.", ["Oven"])).toEqual(["toaster oven"]);
  });
});

describe("dietary pattern on a recipe's text", () => {
  const d = (...patterns: DietaryConstraint["patterns"]): DietaryConstraint => ({ patterns, other: null });

  it("vegetarian: meat and fish are violations, eggs and dairy are not", () => {
    expect(findDietaryViolations("Chicken fried rice", d("vegetarian"))).toEqual(["vegetarian (chicken)"]);
    expect(findDietaryViolations("Salmon bowl", d("vegetarian"))).toEqual(["vegetarian (salmon)"]);
    expect(findDietaryViolations("Egg and cheese omelette with butter", d("vegetarian"))).toEqual([]);
  });

  it("vegan adds animal products — but not plant milks, nut butters or plant-based meats", () => {
    expect(findDietaryViolations("Scrambled eggs", d("vegan"))).toHaveLength(1);
    expect(findDietaryViolations("Coconut milk curry with peanut butter and vegan chicken", d("vegan"))).toEqual([]);
    expect(findDietaryViolations("Oat milk porridge, almond butter, soy yogurt", d("vegan"))).toEqual([]);
    expect(findDietaryViolations("Porridge with plain yogurt", d("vegan"))).toHaveLength(1);
  });

  it("pescatarian allows fish, not meat", () => {
    expect(findDietaryViolations("Tuna salad", d("pescatarian"))).toEqual([]);
    expect(findDietaryViolations("Bacon and eggs", d("pescatarian"))).toEqual(["pescatarian (bacon)"]);
  });

  it("halal and kosher: pork; kosher also shellfish", () => {
    expect(findDietaryViolations("Pork belly", d("halal"))).toEqual(["halal (pork)"]);
    expect(findDietaryViolations("Shrimp pasta", d("halal"))).toEqual([]);
    expect(findDietaryViolations("Shrimp pasta", d("kosher"))).toEqual(["kosher (shrimp)"]);
  });

  it("no pattern, nothing to check; 'other' free text is never matched against", () => {
    expect(findDietaryViolations("Chicken", d())).toEqual([]);
    expect(findDietaryViolations("Chicken", { patterns: [], other: "no red meat" })).toEqual([]);
  });
});

describe("the output check rejects a set that breaks them", () => {
  const constraints = (o: Partial<CookConstraints> = {}): CookConstraints => ({
    decision_mode: "cook",
    max_minutes: 60,
    budget_usd: 50,
    budget_source: "profile",
    equipment: ["Stovetop"],
    equipment_known: true,
    no_cooking: false,
    no_shopping: false,
    allergies: [],
    dietary: { patterns: [], other: null },
    ...o,
  });
  const rec = (o: Parameters<typeof recipe>[0] = {}): Recommendation => recipe({ equipment: ["Stovetop"], ingredients_on_hand: ["Rice"], ingredients_needed: [], ...o });

  it("a step that leans on an appliance the user didn't list", () => {
    const bad = rec({ steps: ["Cook the chicken.", "Warm the rice in the microwave."] });
    expect(findConstraintViolations([bad], constraints()).join()).toMatch(/microwave/);
  });

  it("is quiet when the recipe stays within what they own", () => {
    expect(findConstraintViolations([rec({ steps: ["Boil the rice on the stovetop."] })], constraints())).toEqual([]);
  });

  it("a recipe that conflicts with the dietary pattern", () => {
    const bad = rec({ title: "Chicken Rice Bowl", ingredients_on_hand: ["Chicken", "Rice"] });
    expect(findConstraintViolations([bad], constraints({ dietary: { patterns: ["vegetarian"], other: null } })).join()).toMatch(/vegetarian \(chicken\)/);
  });
});

describe("dietary pattern reaches every mode as a hard constraint", () => {
  const profile = { ...DEFAULT_PROFILE, dietary_patterns: ["vegetarian" as const], dietary_other: "no red meat" };
  const expected = { patterns: ["vegetarian"], other: "no red meat" };

  it("cook", () => {
    const input = resolveRecommendationInput(profile, cookContext());
    expect(input.hard_constraints).toMatchObject({ dietary: expected });
    expect(buildSystemPrompt(input)).toMatch(/Dietary pattern: `dietary` is the dietary pattern/);
  });

  it("order and snack", () => {
    const order = resolveRecommendationInput(profile, { decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "delivery", meal_budget: "no_preference", travel_willingness: "no_preference" });
    const snack = resolveRecommendationInput(profile, { decision_mode: "store_snack", hunger: "normal", craving_type: "anything" });
    for (const input of [order, snack]) {
      expect(input.hard_constraints).toMatchObject({ dietary: expected });
      expect(buildSystemPrompt(input)).toMatch(/hard constraint, as binding as allergies/);
    }
  });

  it("nearby", () => {
    const input = resolveNearbyInput(profile, { decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "eat_nearby", meal_budget: "no_preference", travel_willingness: "no_preference" }, []);
    expect(input.hard_constraints).toMatchObject({ dietary: expected });
    expect(buildSystemPrompt(input)).toMatch(/## Dietary pattern/);
  });

  it("no pattern stated → empty, not invented", () => {
    const input = resolveRecommendationInput(DEFAULT_PROFILE, cookContext());
    expect(input.hard_constraints).toMatchObject({ dietary: { patterns: [], other: null } });
  });
});

describe("\"No cooking at all\" in Make something", () => {
  const meal = (o: Parameters<typeof recipe>[0]) => recipe({ equipment: [], ingredients_on_hand: [], ingredients_needed: [], ...o });
  const problems = (o: Parameters<typeof recipe>[0]) => findNoCookViolations(meal(o) as Parameters<typeof findNoCookViolations>[0]);

  describe("assembling ready-to-eat ingredients is allowed", () => {
    it.each([
      ["canned tuna + avocado + tortilla", { title: "Tuna Avocado Wrap", ingredients_needed: ["1 can tuna", "1 avocado", "1 large tortilla"], steps: ["Drain the tuna.", "Mash the avocado and mix in the tuna.", "Spoon onto the tortilla and roll it up."] }],
      ["rotisserie chicken + bagged salad", { title: "Rotisserie Chicken Salad", ingredients_needed: ["1 cup shredded rotisserie chicken", "1 bag salad kit"], steps: ["Shred the chicken.", "Toss with the salad kit and dressing."] }],
      ["smoked salmon + bread + cucumber", { title: "Smoked Salmon Open Sandwich", ingredients_needed: ["smoked salmon", "bread", "cucumber"], steps: ["Slice the cucumber.", "Layer salmon and cucumber on the bread."] }],
      ["hummus, pre-cooked lentils, roasted red peppers, baked beans (ready-to-eat items described by how they were made)", { title: "Lentil Pita", ingredients_needed: ["pre-cooked lentils", "jarred roasted red peppers", "hummus", "pita"], steps: ["Spread hummus on the pita.", "Top with lentils and peppers."] }],
      ["hot sauce is an ingredient, not heat", { title: "Spicy Tuna Wrap", ingredients_needed: ["canned tuna", "hot sauce"], steps: ["Mix tuna with a dash of hot sauce.", "Wrap in the tortilla."] }],
      ["saying there is no cooking is not cooking", { title: "Yogurt Bowl", steps: ["No cooking needed — spoon yogurt into a bowl.", "Add fruit and nuts."] }],
      ["toast as a food, not a step", { title: "Avocado on Toast", steps: ["Spread mashed avocado on toast.", "Season and serve."] }],
    ])("%s", (_name, o) => {
      expect(problems(o)).toEqual([]);
    });
  });

  describe("heat, or a bought hot meal, is not", () => {
    it("the reported bug: a hot grilled salmon entrée and hot rice from a deli hot bar", () => {
      const result = problems({
        title: "Deli Hot Bar Salmon and Rice",
        ingredients_needed: ["1 hot grilled salmon fillet from the deli counter", "1 cup hot steamed rice from the hot bar"],
        steps: ["Go to the hot bar and buy a cooked salmon entrée and hot rice.", "Put them together on a plate."],
      });
      expect(result.join()).toMatch(/hot food/);
      expect(result.join()).toMatch(/bought prepared meal \(hot bar\)/);
    });

    it.each([
      ["a stove step", { steps: ["Cook the rice in a pot."] }, /cooking or heating step \(cook\)/],
      ["microwaving", { steps: ["Microwave the soup for 2 minutes."] }, /microwave/],
      ["reheating", { steps: ["Reheat the leftover rice."] }, /reheat/],
      ["baking", { steps: ["Bake until golden."] }, /bake/],
      ["frying", { steps: ["Fry the egg in a pan."] }, /fry/],
      ["boiling", { steps: ["Boil the pasta for 8 minutes."] }, /boil/],
      ["grilling", { steps: ["Grill the chicken."] }, /grill/],
      ["air frying", { steps: ["Air fry the nuggets."] }, /air fry/],
      ["warming up", { steps: ["Warm up the tortilla."] }, /warm up/],
      ["toasting the bread (the verb)", { steps: ["Toast the bread, then spread the butter."] }, /toast/],
      ["heat described as a state", { steps: ["Serve once heated through."] }, /heated/],
      ["serving hot", { steps: ["Serve hot."] }, /hot food/],
      ["a bought hot meal", { title: "Hot Bar Plate", ingredients_needed: ["hot food from the hot bar"] }, /bought prepared meal/],
      ["a prepared entrée as the meal", { ingredients_needed: ["1 prepared entrée"] }, /prepared meal \(prepared entrée\)/],
      ["a frozen dinner", { ingredients_needed: ["1 frozen dinner"] }, /frozen dinner/],
      ["takeout", { steps: ["Order takeout and plate it."] }, /takeout/],
    ])("%s", (_name, o, expected) => {
      expect(problems(o).join()).toMatch(expected);
    });
  });

  describe("the output check rejects a no-cook set that needs heat", () => {
    const constraints = (o: Partial<CookConstraints> = {}): CookConstraints => ({
      decision_mode: "cook",
      max_minutes: 60,
      budget_usd: 50,
      budget_source: "profile",
      equipment: [],
      equipment_known: true,
      no_cooking: true,
      no_shopping: false,
      allergies: [],
      dietary: { patterns: [], other: null },
      ...o,
    });
    const rec = (o: Parameters<typeof recipe>[0] = {}): Recommendation => recipe({ equipment: [], ingredients_on_hand: [], ingredients_needed: ["1 can tuna"], steps: ["Open the tuna.", "Eat with crackers."], ...o });

    it("a complete hot prepared meal is rejected even though it names no appliance", () => {
      const bad = rec({ title: "Hot Bar Salmon and Rice", ingredients_needed: ["hot grilled salmon from the deli counter", "hot rice"], steps: ["Buy the hot salmon and hot rice.", "Plate them."] });
      expect(findConstraintViolations([bad], constraints()).join()).toMatch(/isn't a no-cooking meal/);
    });

    it("a step that heats food is rejected", () => {
      expect(findConstraintViolations([rec({ steps: ["Heat the beans.", "Spoon onto bread."] })], constraints()).join()).toMatch(/isn't a no-cooking meal/);
    });

    it("an assembled meal passes", () => {
      expect(findConstraintViolations([rec()], constraints())).toEqual([]);
    });

    it("the same wording is fine for a user who does cook (the rule is only for no-cook)", () => {
      const cooks = constraints({ no_cooking: false, equipment: ["Stovetop"] });
      expect(findConstraintViolations([rec({ equipment: ["Stovetop"], steps: ["Heat the beans on the stovetop."] })], cooks)).toEqual([]);
    });

    it("unknown equipment is treated exactly like no-cook", () => {
      const input = resolveRecommendationInput({ ...DEFAULT_PROFILE, equipment: null }, cookContext());
      expect(input.decision_mode === "cook" && input.hard_constraints.no_cooking).toBe(true);
    });
  });

  describe("the prompt says what No cooking means", () => {
    const promptFor = (equipment: string[] | null) => buildSystemPrompt(resolveRecommendationInput({ ...DEFAULT_PROFILE, equipment }, cookContext()));

    it("states the assemble-only rule, the good examples, and that a bought hot meal is Get food", () => {
      const prompt = promptFor(["No cooking at all"]);
      expect(prompt).toContain("## No cooking at all");
      expect(prompt).toContain("ASSEMBLE");
      expect(prompt).toContain("canned tuna + avocado + tortilla");
      expect(prompt).toMatch(/That is "Get food", not "Make something"/);
    });

    it("is absent for someone who cooks, and present when equipment is unknown", () => {
      expect(promptFor(["Stovetop"])).not.toContain("## No cooking at all");
      expect(promptFor(null)).toContain("## No cooking at all");
    });
  });
});
