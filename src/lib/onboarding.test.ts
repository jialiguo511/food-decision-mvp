import { describe, expect, it } from "vitest";
import { baseDefaults, rememberedDefaults } from "@/lib/recommend/rememberedDefaults";
import { needsOnboarding, offersNutritionStep, profileStage } from "./onboarding";

const SETUP_DONE = { onboarding_completed_at: "2026-09-30T00:00:00Z" };
const FULL_BODY = { sex: "female", age_years: 30, height_cm: 165, weight_kg: 65, activity_level: "lightly_active" };

describe("needsOnboarding", () => {
  it("offers setup to a user with no profile row", () => {
    expect(needsOnboarding(null)).toBe(true);
  });

  it("offers it to an untouched row, once", () => {
    expect(needsOnboarding({ goal: "general_health", prefs: {} })).toBe(true);
    expect(needsOnboarding({ goal: "general_health", prefs: SETUP_DONE })).toBe(false);
  });

  it("never offers it to someone who already filled in their Profile", () => {
    expect(needsOnboarding({ goal: "fat_loss", prefs: {} })).toBe(false);
    expect(needsOnboarding({ goal: "general_health", allergies: ["Peanuts"], prefs: {} })).toBe(false);
    expect(needsOnboarding({ goal: "general_health", weight_kg: 70, prefs: {} })).toBe(false);
  });
});

describe("profileStage", () => {
  it("new: no row, or an untouched row that never went through setup", () => {
    expect(profileStage(null)).toBe("new");
    expect(profileStage({ goal: "general_health", prefs: {} })).toBe("new");
  });

  it("partial: set up, but nothing yet that can estimate portions", () => {
    expect(profileStage({ goal: "general_health", prefs: SETUP_DONE })).toBe("partial");
    // Some details stored, not enough for an estimate: still partial, and
    // setup is not repeated.
    expect(profileStage({ goal: "general_health", weight_kg: 70, prefs: {} })).toBe("partial");
  });

  it("complete: a full set of details, a hand-set calorie target, or the step already dismissed", () => {
    expect(profileStage({ goal: "maintain", ...FULL_BODY, prefs: SETUP_DONE })).toBe("complete");
    expect(profileStage({ goal: "maintain", daily_calorie_target_kcal: 2000, prefs: SETUP_DONE })).toBe("complete");
    expect(profileStage({ goal: "general_health", prefs: { ...SETUP_DONE, nutrition_nudge_done_at: "2026-10-01T00:00:00Z" } })).toBe("complete");
  });

  it("existing users who already have full details are never asked again", () => {
    // No setup flag at all (set up before this existed), details already there.
    expect(offersNutritionStep({ goal: "fat_loss", ...FULL_BODY, prefs: {} })).toBe(false);
    expect(profileStage({ goal: "fat_loss", ...FULL_BODY, prefs: {} })).toBe("complete");
  });

  it("the default protein stored on old rows does not count as having set a target", () => {
    expect(offersNutritionStep({ goal: "general_health", protein_target_g: 120, prefs: SETUP_DONE })).toBe(true);
  });
});

describe("profile stage and mode memory are independent", () => {
  const cookSession = { decision_mode: "cook", cook_minutes: 20, hunger: "very_hungry", effort: "minimal", shopping: "can_buy", craving: null, ingredients_on_hand: [], budget_override_usd: null };

  it("a complete profile with no sessions has no remembered mode — every mode starts from its questions", () => {
    expect(profileStage({ goal: "maintain", ...FULL_BODY, prefs: SETUP_DONE })).toBe("complete");
    expect(rememberedDefaults([]).remembered).toEqual({ cook: false, order: false, store_snack: false });
  });

  it("a brand-new profile can still have used a mode, and only that mode is remembered", () => {
    expect(profileStage(null)).toBe("new");
    const defaults = rememberedDefaults([cookSession]);
    expect(defaults.remembered).toEqual({ cook: true, order: false, store_snack: false });
    expect(defaults.cook.hunger).toBe("very_hungry");
    expect(defaults.order).toEqual(baseDefaults().order);
  });
});
