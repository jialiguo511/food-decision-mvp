import { describe, expect, it } from "vitest";
import { DEFAULT_PROTEIN_TARGET_G } from "./options";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import { DEFAULT_FORM_VALUES, resolveProfile, toProfileFormValues, toProfileInput, validateProfileForm } from "./profile";
import { buildSystemPrompt, buildUserMessage } from "./recommend/prompt";
import { resolveNearbyInput, resolveRecommendationInput } from "./recommend/input";
import type { MealContext, OrderContext, ProfileFormValues, StoreSnackContext } from "./types";

// A row exactly as it existed before Profile v2: no allergies/body columns, and
// protein_target_g always a number (it was NOT NULL).
const OLD_ROW = {
  id: "u1",
  display_name: "Sam",
  goal: "fat_loss",
  protein_target_g: 140,
  daily_calorie_target_kcal: null,
  budget_per_meal_usd: "12.00",
  fridge_size: "standard",
  default_cook_minutes: 30,
  cuisines: ["Thai"],
  dislikes: ["Cilantro", "Shellfish"],
  equipment: ["Stovetop"],
  prefs: {},
};

const BODY: Partial<ProfileFormValues> = {
  sex: "male",
  age_years: 30,
  height_cm: 180,
  weight_kg: 80,
  activity_level: "moderately_active",
};

describe("existing and fresh profiles stay valid", () => {
  it("an old row reads fine: new fields are 'not set', old values are kept as manual", () => {
    const form = toProfileFormValues(OLD_ROW);
    expect(form).toMatchObject({ allergies: [], sex: null, age_years: null, height_cm: null, weight_kg: null, activity_level: null });
    expect(form.protein_target_g).toBe(140);
    expect(form.dislikes).toEqual(["Cilantro", "Shellfish"]);
    // Stored 12 / 30 min equal what an untouched row holds, so before provenance
    // existed they can't be told apart from "never chose" — read as not set.
    expect(form.budget_per_meal_usd).toBeNull();
    expect(form.default_cook_minutes).toBeNull();
    // A value that differs from the untouched default can only have been chosen.
    expect(form.goal).toBe("fat_loss");
    expect(form.equipment).toEqual(["Stovetop"]);
  });

  it("an old row still resolves for the recommender — its own protein, no fabricated calories", () => {
    const input = toProfileInput(OLD_ROW);
    expect(input.protein_target_g).toBe(140);
    expect(input.daily_calorie_target_kcal).toBeNull();
    expect(input.allergies).toEqual([]);
  });

  it("a brand-new user (no row) gets today's defaults and no estimates", () => {
    expect(toProfileFormValues(null)).toEqual(DEFAULT_FORM_VALUES);
    const input = toProfileInput(null);
    expect(input.protein_target_g).toBe(DEFAULT_PROTEIN_TARGET_G);
    expect(input.daily_calorie_target_kcal).toBeNull();
  });

  it("missing body info never breaks resolving, and never invents a target", () => {
    const input = resolveProfile({ ...DEFAULT_FORM_VALUES, age_years: 30, sex: "male" });
    expect(input.daily_calorie_target_kcal).toBeNull();
    expect(input.protein_target_g).toBe(DEFAULT_PROTEIN_TARGET_G);
  });

  it("the defaults validate and save", () => {
    expect(validateProfileForm(DEFAULT_FORM_VALUES).ok).toBe(true);
  });
});

describe("calculated defaults vs manual overrides", () => {
  const form = { ...DEFAULT_FORM_VALUES, ...BODY, goal: "fat_loss" } as ProfileFormValues;

  it("uses the calculated suggestions when nothing is set manually", () => {
    const input = resolveProfile(form);
    expect(input.protein_target_g).toBe(145); // 80 kg × 1.8
    expect(input.daily_calorie_target_kcal).toBe(2350); // 2759 × 0.85
  });

  it("a manual value always wins, and changing the body inputs does not replace it", () => {
    const manual = { ...form, protein_target_g: 100, daily_calorie_target_kcal: 1900 };
    expect(resolveProfile(manual).protein_target_g).toBe(100);
    expect(resolveProfile(manual).daily_calorie_target_kcal).toBe(1900);
    const heavier = { ...manual, weight_kg: 120, activity_level: "very_active" as const, goal: "muscle_gain" as const };
    expect(resolveProfile(heavier).protein_target_g).toBe(100);
    expect(resolveProfile(heavier).daily_calorie_target_kcal).toBe(1900);
  });

  it("'Eat better' gets a protein suggestion but no calorie target", () => {
    const input = resolveProfile({ ...form, goal: "general_health" });
    expect(input.protein_target_g).toBe(95);
    expect(input.daily_calorie_target_kcal).toBeNull();
  });

  it("a saved profile stores only inputs and overrides — no calculated values", () => {
    const v = validateProfileForm(form);
    if (!v.ok) throw new Error(v.error);
    expect(v.row.protein_target_g).toBeNull();
    expect(v.row.daily_calorie_target_kcal).toBeNull();
    expect(Object.keys(v.row).some((k) => /bmr|tdee|suggest/i.test(k))).toBe(false);
  });
});

describe("validateProfileForm", () => {
  const ok = { ...DEFAULT_FORM_VALUES, ...BODY } as ProfileFormValues;

  it("rejects out-of-range body inputs instead of clamping them", () => {
    expect(validateProfileForm({ ...ok, age_years: 12 }).ok).toBe(false);
    expect(validateProfileForm({ ...ok, height_cm: 30 }).ok).toBe(false);
    expect(validateProfileForm({ ...ok, weight_kg: 900 }).ok).toBe(false);
    expect(validateProfileForm({ ...ok, daily_calorie_target_kcal: 50 }).ok).toBe(false);
  });

  it("rejects unknown sex / activity values", () => {
    expect(validateProfileForm({ ...ok, sex: "x" as never }).ok).toBe(false);
    expect(validateProfileForm({ ...ok, activity_level: "extreme" as never }).ok).toBe(false);
  });

  it("normalizes and de-duplicates allergies and dislikes, and keeps them separate", () => {
    const v = validateProfileForm({
      ...ok,
      allergies: ["peanuts", " Peanuts", "TREE nuts"],
      dislikes: ["PEANUTS", "  mushrooms ", "Mushrooms"],
    });
    if (!v.ok) throw new Error(v.error);
    expect(v.row.allergies).toEqual(["Peanuts", "Tree nuts"]);
    expect(v.row.dislikes).toEqual(["Mushrooms"]);
  });

  it("stores metric values to one decimal", () => {
    const v = validateProfileForm({ ...ok, height_cm: 177.80001, weight_kg: 81.6466 });
    if (!v.ok) throw new Error(v.error);
    expect(v.row.height_cm).toBe(177.8);
    expect(v.row.weight_kg).toBe(81.6);
  });
});

describe("recommender integration", () => {
  const profile = { ...DEFAULT_PROFILE, allergies: ["Peanuts"], dislikes: ["Mushrooms"] };
  const cook: MealContext = {
    decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy",
    craving: null, ingredients_on_hand: [], budget_override_usd: null,
  };
  const order: OrderContext = {
    decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null,
    method: "delivery", meal_budget: "no_preference", travel_willingness: "no_preference",
  };
  const snack: StoreSnackContext = { decision_mode: "store_snack", hunger: "normal", craving_type: "anything" };

  it.each([
    ["cook", cook],
    ["order", order],
    ["store_snack", snack],
  ] as const)("%s: allergies are a hard constraint; dislikes are soft and never hard", (_mode, context) => {
    const input = resolveRecommendationInput(profile, context);
    expect(input.hard_constraints).toMatchObject({ allergies: ["Peanuts"] });
    expect(JSON.stringify(input.hard_constraints)).not.toContain("Mushrooms");
    expect(input.soft_preferences).toMatchObject({ disliked_foods: ["Mushrooms"] });
    expect(JSON.stringify(input.soft_preferences)).not.toContain("Peanuts");
    expect(buildUserMessage(input)).toContain('"allergies"');
  });

  it("nearby carries allergies as hard and dislikes as soft", () => {
    const input = resolveNearbyInput(profile, { ...order, method: "eat_nearby", nearby: true }, []);
    expect(input.hard_constraints).toEqual({ decision_mode: "nearby", allergies: ["Peanuts"], dietary: { patterns: [], other: null } });
    expect(input.soft_preferences.disliked_foods).toEqual(["Mushrooms"]);
  });

  it.each([
    ["cook", cook],
    ["order", order],
    ["store_snack", snack],
  ] as const)("%s prompt: allergies are a safety constraint, dislikes a strong-but-soft preference", (_mode, context) => {
    const prompt = buildSystemPrompt(resolveRecommendationInput(profile, context));
    expect(prompt).toContain("safety constraint, never a preference");
    expect(prompt).toContain("Never say or imply a meal is allergen-free or safe");
    expect(prompt).toContain("not a safety rule");
    expect(prompt).toContain("Never describe a dislike as an allergy");
    expect(prompt).not.toContain("hard_constraints.avoid");
  });

  it("calculated targets reach the prompt as the existing soft guidance", () => {
    const row = { ...OLD_ROW, protein_target_g: null, daily_calorie_target_kcal: null, sex: "male", age_years: 30, height_cm: "180.0", weight_kg: "80.0", activity_level: "moderately_active" };
    const input = resolveRecommendationInput(toProfileInput(row), cook);
    expect(input.soft_preferences).toMatchObject({ daily_protein_target_g: 145, daily_calorie_target_kcal: 2350 });
    expect(buildSystemPrompt(input)).toContain("daily calorie target is 2,350 kcal");
  });

  it("an old profile with no body data produces the same qualitative guidance as before", () => {
    const input = resolveRecommendationInput(toProfileInput(OLD_ROW), cook);
    expect(input.soft_preferences).toMatchObject({ daily_protein_target_g: 140, daily_calorie_target_kcal: null });
    expect(buildSystemPrompt(input)).toContain("has not set a daily calorie target");
  });
});
