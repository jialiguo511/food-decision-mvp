import { describe, expect, it } from "vitest";
import {
  ACTIVITY_FACTORS,
  cmToFeetInches,
  effectiveTarget,
  estimateEnergy,
  feetInchesToCm,
  kgToLb,
  lbToKg,
  mifflinStJeorBmr,
  suggestProtein,
  tdee,
  type BodyInputs,
} from "./nutrition";

const male: BodyInputs = { sex: "male", age_years: 30, height_cm: 180, weight_kg: 80, activity_level: "sedentary" };
const female: BodyInputs = { ...male, sex: "female" };

describe("Mifflin–St Jeor BMR", () => {
  it("male: 10w + 6.25h − 5a + 5", () => {
    expect(mifflinStJeorBmr(male)).toBe(10 * 80 + 6.25 * 180 - 5 * 30 + 5); // 1780
  });
  it("female: 10w + 6.25h − 5a − 161", () => {
    expect(mifflinStJeorBmr(female)).toBe(10 * 80 + 6.25 * 180 - 5 * 30 - 161); // 1614
  });
});

describe("activity multipliers", () => {
  it("uses the four agreed factors", () => {
    expect(ACTIVITY_FACTORS).toEqual({ sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725 });
  });
  it("TDEE = BMR × factor for each level", () => {
    expect(tdee(1780, "sedentary")).toBeCloseTo(2136);
    expect(tdee(1780, "lightly_active")).toBeCloseTo(2447.5);
    expect(tdee(1780, "moderately_active")).toBeCloseTo(2759);
    expect(tdee(1780, "very_active")).toBeCloseTo(3070.5);
  });
});

describe("missing or out-of-range inputs never produce a misleading number", () => {
  it.each([
    ["sex", { sex: null }],
    ["age", { age_years: null }],
    ["height", { height_cm: null }],
    ["weight", { weight_kg: null }],
    ["activity", { activity_level: null }],
    ["a minor's age", { age_years: 15 }],
    ["an impossible height", { height_cm: 20 }],
    ["an impossible weight", { weight_kg: 5 }],
  ])("no estimate without %s", (_name, patch) => {
    expect(estimateEnergy({ ...male, ...patch } as BodyInputs, "maintain")).toBeNull();
  });

  it("no protein suggestion without a valid weight", () => {
    expect(suggestProtein(null, "maintain")).toBeNull();
    expect(suggestProtein(5, "maintain")).toBeNull();
  });
});

describe("energy estimate by goal", () => {
  const body: BodyInputs = { ...male, activity_level: "moderately_active" }; // BMR 1780, TDEE 2759

  it("reports BMR and maintenance separately, rounded as estimates", () => {
    const e = estimateEnergy(body, "maintain");
    expect(e?.bmr).toBe(1780);
    expect(e?.maintenance).toBe(2750);
    expect(e?.suggested).toMatchObject({ target: 2750, floorApplied: false });
  });

  it("fat loss is a modest −15% (range −10 to −20%)", () => {
    const s = estimateEnergy(body, "fat_loss")?.suggested;
    expect(s?.target).toBe(2350); // 2759 × 0.85 = 2345
    expect(s?.low).toBe(2200); // × 0.80
    expect(s?.high).toBe(2500); // × 0.90
  });

  it("muscle gain is a small +10% surplus", () => {
    expect(estimateEnergy(body, "muscle_gain")?.suggested?.target).toBe(3050); // 3035
  });

  it("'Eat better' has no calorie target — maintenance only", () => {
    const e = estimateEnergy(body, "general_health");
    expect(e?.maintenance).toBe(2750);
    expect(e?.suggested).toBeNull();
  });

  it("never suggests eating below the floor, and says so", () => {
    const small: BodyInputs = { sex: "female", age_years: 60, height_cm: 150, weight_kg: 45, activity_level: "sedentary" };
    const s = estimateEnergy(small, "fat_loss")?.suggested;
    expect(s?.target).toBe(1200);
    expect(s?.floorApplied).toBe(true);
  });
});

describe("protein suggestion", () => {
  it("is grams per kg by goal, in 5 g steps", () => {
    expect(suggestProtein(80, "general_health")).toEqual({ target: 95, low: 80, high: 110 });
    expect(suggestProtein(80, "maintain")).toEqual({ target: 110, low: 95, high: 130 });
    expect(suggestProtein(80, "fat_loss")).toEqual({ target: 145, low: 130, high: 160 });
    expect(suggestProtein(80, "muscle_gain")).toEqual({ target: 145, low: 130, high: 160 });
  });
  it("stays inside the slider's bounds", () => {
    expect(suggestProtein(35, "general_health")?.low).toBe(60);
    expect(suggestProtein(150, "muscle_gain")?.high).toBe(220);
  });
});

describe("manual targets beat suggestions", () => {
  it("a manual value is never replaced; null falls back to the suggestion, then the default", () => {
    expect(effectiveTarget(2000, 2350, null)).toBe(2000);
    expect(effectiveTarget(null, 2350, null)).toBe(2350);
    expect(effectiveTarget(null, null, null)).toBeNull();
    expect(effectiveTarget(null, null, 120)).toBe(120);
  });
});

describe("unit conversion", () => {
  it("converts pounds and kilograms", () => {
    expect(lbToKg(180)).toBeCloseTo(81.65, 2);
    expect(kgToLb(lbToKg(180))).toBeCloseTo(180, 6);
  });
  it("converts feet/inches to cm and back", () => {
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8, 6);
    expect(cmToFeetInches(177.8)).toEqual({ feet: 5, inches: 10 });
    expect(cmToFeetInches(182.88)).toEqual({ feet: 6, inches: 0 });
  });
  it("carries rounded inches into a foot", () => {
    expect(cmToFeetInches(181.6)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFeetInches(182.0)).toEqual({ feet: 6, inches: 0 }); // 71.65 in → 72
  });
});
