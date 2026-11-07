import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import { DEFAULT_FORM_VALUES, resolveProfile, toProfileFormValues, toProfileInput, validateProfileForm } from "./profile";
import {
  CONDITION_SUGGESTS_PRIORITY,
  sanitizeConditions,
  sanitizePriorities,
  suggestedPriorities,
} from "./nutritionPriorities";
import { resolveNearbyInput, resolveRecommendationInput } from "./recommend/input";
import { buildSystemPrompt, buildUserMessage } from "./recommend/prompt";
import { storedRecommendationsSchema } from "./recommend/output";
import type { MealContext, NutritionPriority, OrderContext, ProfileFormValues, StoreSnackContext } from "./types";

const cook: MealContext = {
  decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy",
  craving: null, ingredients_on_hand: [], budget_override_usd: null,
};
const order: OrderContext = {
  decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null,
  method: "delivery", meal_budget: "no_preference", travel_willingness: "no_preference",
};
const snack: StoreSnackContext = { decision_mode: "store_snack", hunger: "normal", craving_type: "anything" };
const profileWith = (nutrition_priorities: NutritionPriority[]) => ({ ...DEFAULT_PROFILE, nutrition_priorities });

describe("condition → priority suggestion (never automatic)", () => {
  it.each([
    ["high_blood_pressure", "lower_sodium"],
    ["prediabetes_or_diabetes", "limit_added_sugar"],
    ["high_cholesterol", "lower_saturated_fat"],
  ] as const)("%s suggests %s but does not enable it", (condition, priority) => {
    expect(CONDITION_SUGGESTS_PRIORITY[condition]).toBe(priority);
    expect(suggestedPriorities([condition], [])).toEqual([priority]);

    // Selecting the condition alone leaves confirmed priorities empty — in the
    // saved row and for the recommender.
    const form = { ...DEFAULT_FORM_VALUES, health_conditions: [condition] } as ProfileFormValues;
    const saved = validateProfileForm(form);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.row.health_conditions).toEqual([condition]);
    expect(saved.row.nutrition_priorities).toEqual([]);
    expect(resolveProfile(form).nutrition_priorities).toEqual([]);
    const input = resolveRecommendationInput(resolveProfile(form), cook);
    expect("nutrition_priorities" in input).toBe(false);
  });

  it("stops suggesting once the priority is confirmed, and never changes it", () => {
    const confirmed: NutritionPriority[] = ["lower_sodium"];
    expect(suggestedPriorities(["high_blood_pressure"], confirmed)).toEqual([]);
    expect(confirmed).toEqual(["lower_sodium"]);
  });

  it("several conditions suggest several priorities, each once", () => {
    expect(suggestedPriorities(["high_blood_pressure", "high_cholesterol", "high_blood_pressure"], [])).toEqual([
      "lower_sodium",
      "lower_saturated_fat",
    ]);
  });

  it("the recommender never sees the condition, only a confirmed priority", () => {
    const form = { ...DEFAULT_FORM_VALUES, health_conditions: ["high_blood_pressure"], nutrition_priorities: ["lower_sodium"] } as ProfileFormValues;
    const message = buildUserMessage(resolveRecommendationInput(resolveProfile(form), cook));
    expect(message).toContain("lower_sodium");
    expect(message).not.toContain("high_blood_pressure");
    expect(message).not.toMatch(/blood pressure|diabetes|cholesterol/i);
  });
});

describe("unsupported values are never stored or inferred", () => {
  it("drops unknown conditions and priorities on read and on save", () => {
    const row = { health_conditions: ["high_blood_pressure", "kidney_disease", "pregnancy", 7], nutrition_priorities: ["lower_sodium", "low_carb", "low_potassium"] };
    const form = toProfileFormValues(row);
    expect(form.health_conditions).toEqual(["high_blood_pressure"]);
    expect(form.nutrition_priorities).toEqual(["lower_sodium"]);
    const saved = validateProfileForm({ ...DEFAULT_FORM_VALUES, health_conditions: ["ckd" as never], nutrition_priorities: ["low_carb" as never] });
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.row.health_conditions).toEqual([]);
    expect(saved.row.nutrition_priorities).toEqual([]);
    expect(sanitizeConditions("not an array")).toEqual([]);
    expect(sanitizePriorities(["lower_sodium", "lower_sodium"])).toEqual(["lower_sodium"]);
  });

  it("nothing is inferred from dislikes, allergies, or behavior-shaped data", () => {
    const form = toProfileFormValues({ dislikes: ["Salt"], allergies: ["Dairy"], prefs: { high_blood_pressure: true } });
    expect(form.health_conditions).toEqual([]);
    expect(form.nutrition_priorities).toEqual([]);
  });
});

describe("backward compatibility", () => {
  const OLD_ROW = { id: "u", goal: "maintain", protein_target_g: 120, budget_per_meal_usd: "12", fridge_size: "standard", default_cook_minutes: 30, cuisines: [], dislikes: [], equipment: [] };

  it("an old row parses, with no conditions or priorities", () => {
    const form = toProfileFormValues(OLD_ROW);
    expect(form.health_conditions).toEqual([]);
    expect(form.nutrition_priorities).toEqual([]);
  });

  it("a user with no priorities gets exactly the same input and prompt as before", () => {
    for (const context of [cook, order, snack]) {
      const input = resolveRecommendationInput(toProfileInput(OLD_ROW), context);
      expect("nutrition_priorities" in input).toBe(false);
      const prompt = buildSystemPrompt(input);
      expect(prompt).not.toContain("Nutrition priorities");
      expect(prompt).toContain("always null (the user has no nutrition priorities set)");
    }
    const nearby = resolveNearbyInput(toProfileInput(OLD_ROW), { ...order, method: "eat_nearby", nearby: true }, []);
    expect("nutrition_priorities" in nearby).toBe(false);
    expect(buildSystemPrompt(nearby)).not.toContain("Nutrition priorities");
  });

  it("recommendations saved before `watch` existed still restore, with watch = null", () => {
    const old = {
      decision_mode: "order", role: "best_match", title: "Curry", reason: "r",
      search_terms: ["curry"], order_notes: "n", modification: null, estimated_calories: 600, estimated_protein_g: 30,
    };
    const parsed = storedRecommendationsSchema.safeParse([old, { ...old, role: "lowest_effort", title: "B" }, { ...old, role: "alternative", title: "C" }]);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data[0]).toMatchObject({ watch: null });
  });
});

describe.each([
  ["lower_sodium", "Sodium: prefer less salty", "sauce or dressing on the side"],
  ["limit_added_sugar", "Added sugar:", "not carbohydrates in general"],
  ["lower_saturated_fat", "Saturated fat:", "Fat in general is not bad"],
] as const)("%s reaches the recommender", (priority, guidance, guardrail) => {
  const profile = profileWith([priority]);

  it.each([
    ["cook", cook],
    ["order", order],
    ["store_snack", snack],
  ] as const)("%s: in the input and prompt, with its own guidance and guardrail", (_m, context) => {
    const input = resolveRecommendationInput(profile, context);
    expect(input.nutrition_priorities).toEqual([priority]);
    expect(buildUserMessage(input)).toContain(priority);
    const prompt = buildSystemPrompt(input);
    expect(prompt).toContain("Nutrition priorities (strong guidance)");
    expect(prompt).toContain(guidance);
    expect(prompt).toContain(guardrail);
    expect(prompt).toContain("- watch: one short sentence");
  });

  it("nearby: in the input and prompt", () => {
    const input = resolveNearbyInput(profile, { ...order, method: "eat_nearby", nearby: true }, []);
    expect(input.nutrition_priorities).toEqual([priority]);
    expect(buildSystemPrompt(input)).toContain(guidance);
  });
});

describe("priority order in the prompt", () => {
  const prompt = buildSystemPrompt(resolveRecommendationInput({ ...profileWith(["lower_sodium"]), allergies: ["Peanuts"], dislikes: ["Mushrooms"] }, cook));

  it("allergies (hard) come before nutrition priorities, which come before soft preferences", () => {
    const allergies = prompt.indexOf("Allergies:");
    const priorities = prompt.indexOf("## Nutrition priorities");
    const soft = prompt.indexOf("## Soft preferences");
    expect(allergies).toBeGreaterThan(-1);
    expect(allergies).toBeLessThan(priorities);
    expect(priorities).toBeLessThan(soft);
  });

  it("states priorities are strong but not hard, never override allergies, and carry no amounts or medical claims", () => {
    expect(prompt).toContain("It is NOT a hard constraint — only allergies are");
    expect(prompt).toContain("never overrides an allergy or another hard constraint");
    expect(prompt).toContain("Never state or imply an amount");
    expect(prompt).toContain("never make a medical claim or mention any condition");
    expect(prompt).toContain("Do not invent further dietary rules");
  });

  it("allergies stay in hard_constraints, priorities are separate, dislikes stay soft", () => {
    const input = resolveRecommendationInput({ ...profileWith(["lower_sodium"]), allergies: ["Peanuts"], dislikes: ["Mushrooms"] }, cook);
    expect(input.hard_constraints).toMatchObject({ allergies: ["Peanuts"] });
    expect(JSON.stringify(input.hard_constraints)).not.toContain("lower_sodium");
    expect(input.nutrition_priorities).toEqual(["lower_sodium"]);
    expect(input.soft_preferences).toMatchObject({ disliked_foods: ["Mushrooms"] });
  });
});
