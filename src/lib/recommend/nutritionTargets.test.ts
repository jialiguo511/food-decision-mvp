// calculateNutritionTargets — the one place a profile becomes targets — and the
// soft meal-fit scoring built on it, including the point of it all: two
// different people get different rankings of the SAME cards.

import { describe, expect, it } from "vitest";
import { calculateNutritionTargets, targetsSignature, type NutritionProfile } from "../nutrition";
import { resolveProfile } from "../profile";
import { DEFAULT_FORM_VALUES } from "../profile";
import { mealTargetsFor, rankByNutritionFit, scoreMealFit } from "./nutritionFit";
import type { CookRecommendation } from "../types";
import { recipe } from "@/test/savedFixtures";

const NONE: NutritionProfile = { goal: null, daily_calorie_target_kcal: null, protein_target_g: null, sex: null, age_years: null, height_cm: null, weight_kg: null, activity_level: null };
const body = { sex: "male", age_years: 30, height_cm: 180, weight_kg: 80, activity_level: "moderately_active" } as const;
const FALLBACK = 120;

describe("calculateNutritionTargets", () => {
  it("nothing entered: no numbers invented — protein is the flagged fallback, energy is null, nothing is personal", () => {
    const t = calculateNutritionTargets(NONE, FALLBACK);
    expect(t).toMatchObject({ bmr: null, maintenance: null, calories: null, personalized: false });
    expect(t.protein).toMatchObject({ target: 120, source: "fallback" });
  });

  it("BMR is an intermediate: maintenance is BMR × activity, and the daily range is goal-adjusted from maintenance", () => {
    const t = calculateNutritionTargets({ ...NONE, ...body, goal: "fat_loss" }, FALLBACK);
    expect(t.bmr).toBe(1780);
    expect(t.maintenance).toBe(2750); // 1780 × 1.55 = 2759 → nearest 50
    expect(t.calories).toMatchObject({ source: "estimated", target: 2350, low: 2200, high: 2500 }); // −15% / −20% / −10%
    expect(t.calories!.high).toBeLessThan(t.maintenance!);
    expect(t.calories!.target).not.toBe(t.bmr);
  });

  it("goal moves the range: muscle gain sits above maintenance, fat loss below, 'Eat better' promises no number", () => {
    const at = (goal: NutritionProfile["goal"]) => calculateNutritionTargets({ ...NONE, ...body, goal }, FALLBACK);
    expect(at("muscle_gain").calories!.target).toBeGreaterThan(at("maintain").calories!.target);
    expect(at("fat_loss").calories!.target).toBeLessThan(at("maintain").calories!.target);
    expect(at("general_health").calories).toBeNull();
    expect(at("general_health").maintenance).toBe(2750); // still shown for reference
  });

  it("protein follows weight and goal; a manual value always wins, for protein and calories", () => {
    expect(calculateNutritionTargets({ ...NONE, ...body, goal: "fat_loss" }, FALLBACK).protein).toMatchObject({ source: "estimated", target: 145 }); // 80 kg × 1.8
    const manual = calculateNutritionTargets({ ...NONE, ...body, goal: "fat_loss", protein_target_g: 100, daily_calorie_target_kcal: 2000 }, FALLBACK);
    expect(manual.protein).toMatchObject({ source: "manual", target: 100 });
    expect(manual.calories).toMatchObject({ source: "manual", target: 2000 });
  });

  it("a gentle floor: a suggested range never goes below the minimum", () => {
    const small = calculateNutritionTargets({ ...NONE, sex: "female", age_years: 60, height_cm: 150, weight_kg: 45, activity_level: "sedentary", goal: "fat_loss" }, FALLBACK);
    expect(small.calories!.low).toBeGreaterThanOrEqual(1200);
    expect(small.calories!.floorApplied).toBe(true);
  });

  it("incomplete details give no energy estimate (nothing fabricated), though weight still gives protein", () => {
    const t = calculateNutritionTargets({ ...NONE, goal: "maintain", weight_kg: 70 }, FALLBACK);
    expect(t.calories).toBeNull();
    expect(t.protein.source).toBe("estimated");
    expect(t.personalized).toBe(true);
  });

  it("the recommender's profile is read from THIS result, so the prompt and the screen can't disagree", () => {
    const form = { ...DEFAULT_FORM_VALUES, ...body, goal: "maintain" as const };
    const t = calculateNutritionTargets(form, FALLBACK);
    const resolved = resolveProfile(form);
    expect(resolved.protein_target_g).toBe(t.protein.target);
    expect(resolved.daily_calorie_target_kcal).toBe(t.calories!.target);
  });

  it("the signature changes exactly when the sizing changes", () => {
    const a = calculateNutritionTargets({ ...NONE, ...body, goal: "maintain" }, FALLBACK);
    const same = calculateNutritionTargets({ ...NONE, ...body, goal: "maintain", age_years: 31 }, FALLBACK);
    const other = calculateNutritionTargets({ ...NONE, ...body, goal: "fat_loss" }, FALLBACK);
    expect(targetsSignature(a)).toBe(targetsSignature(same)); // one year changes nothing at this rounding
    expect(targetsSignature(a)).not.toBe(targetsSignature(other));
  });
});

const card = (title: string, estimated_calories: number, estimated_protein_g: number, role: CookRecommendation["role"]): CookRecommendation =>
  recipe({ title, estimated_calories, estimated_protein_g, role });

// The same three cards, as the model might return them.
const LIGHT = card("Veggie Wrap", 350, 15, "lowest_effort");
const BALANCED = card("Chicken Rice Bowl", 600, 40, "best_match");
const HEARTY = card("Loaded Burrito Plate", 950, 55, "alternative");
const CARDS = [BALANCED, LIGHT, HEARTY];

const person = (over: Partial<NutritionProfile>) => calculateNutritionTargets({ ...NONE, ...over }, FALLBACK);
const smallSedentary = person({ sex: "female", age_years: 45, height_cm: 160, weight_kg: 55, activity_level: "sedentary", goal: "fat_loss" });
const bigLifter = person({ sex: "male", age_years: 25, height_cm: 188, weight_kg: 95, activity_level: "very_active", goal: "muscle_gain" });

describe("nutrition-dependent scoring", () => {
  it("nothing personal behind the targets: no scoring, nothing re-ordered", () => {
    expect(mealTargetsFor(person({}), "normal")).toBeNull();
    const result = rankByNutritionFit(CARDS, null);
    expect(result.changed).toBe(false);
    expect(result.recommendations).toEqual(CARDS);
  });

  it("a meal is sized from the day and scales with hunger", () => {
    const light = mealTargetsFor(bigLifter, "light")!;
    const hungry = mealTargetsFor(bigLifter, "very_hungry")!;
    expect(hungry.kcal!.high).toBeGreaterThan(light.kcal!.high);
    expect(hungry.protein!.low).toBeGreaterThan(light.protein!.low);
  });

  it("two meaningfully different profiles rank the SAME cards differently", () => {
    const orderFor = (t: ReturnType<typeof person>) => rankByNutritionFit(CARDS, mealTargetsFor(t, "normal")).recommendations.map((r) => r.title);
    const small = orderFor(smallSedentary);
    const big = orderFor(bigLifter);
    expect(small).not.toEqual(big);
    // A small, sedentary person on a fat-loss goal (a ~1,200 kcal day) is best served by the light wrap;
    // a large, very active person building muscle (a ~3,800 kcal day) by the hearty plate — the opposite end.
    expect(small[0]).toBe("Veggie Wrap");
    expect(big[0]).toBe("Loaded Burrito Plate");
    expect(small.indexOf("Veggie Wrap")).toBeLessThan(small.indexOf("Loaded Burrito Plate"));
    expect(big.indexOf("Loaded Burrito Plate")).toBeLessThan(big.indexOf("Veggie Wrap"));
  });

  it("scores say why: too little protein, too many calories", () => {
    const meal = mealTargetsFor(smallSedentary, "normal")!;
    expect(scoreMealFit(HEARTY, meal)).toMatchObject({ calories: "high" });
    expect(scoreMealFit(LIGHT, meal).protein).toBe("low");
    expect(scoreMealFit(BALANCED, meal).score).toBeGreaterThan(scoreMealFit(HEARTY, meal).score);
  });

  it("goal weights what matters: fat loss punishes calories harder, muscle gain punishes low protein harder", () => {
    const sameBody = { sex: "male", age_years: 30, height_cm: 180, weight_kg: 80, activity_level: "moderately_active" } as const;
    const cut = mealTargetsFor(person({ ...sameBody, goal: "fat_loss" }), "normal")!;
    const bulk = mealTargetsFor(person({ ...sameBody, goal: "muscle_gain" }), "normal")!;
    expect(cut.weights.kcal).toBeGreaterThan(cut.weights.protein);
    expect(bulk.weights.protein).toBeGreaterThan(bulk.weights.kcal);
  });

  it("stable and soft: equal scores keep their order, every card keeps its role, none is added or dropped", () => {
    const meal = mealTargetsFor(person({ weight_kg: 70, goal: "maintain" }), "normal")!;
    const twin = card("Twin", BALANCED.estimated_calories, BALANCED.estimated_protein_g, "alternative");
    const out = rankByNutritionFit([BALANCED, twin], meal);
    expect(out.recommendations.map((r) => r.title)).toEqual(["Chicken Rice Bowl", "Twin"]);
    const all = rankByNutritionFit(CARDS, mealTargetsFor(bigLifter, "normal")).recommendations;
    expect(all.map((r) => r.title).sort()).toEqual(CARDS.map((r) => r.title).sort());
    expect(all.find((r) => r.title === "Veggie Wrap")!.role).toBe("lowest_effort");
  });

  it("snacks are sized well below meals", () => {
    expect(mealTargetsFor(bigLifter, "normal", "snack")!.kcal!.high).toBeLessThan(mealTargetsFor(bigLifter, "normal", "meal")!.kcal!.low);
  });
});
