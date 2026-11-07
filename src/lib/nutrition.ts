// Estimated energy needs and protein suggestion from explicit Profile inputs.
// Pure functions, one place for every formula — components only call these.
//
// Everything here is an ESTIMATE from a standard equation (Mifflin–St Jeor)
// and rough per-kg protein ranges, not a prescription and not medical advice.
// BMR is what the body uses at rest; it is never an eating target. Nothing
// here is stored — the Profile stores only the user's inputs and any manual
// override, and these are recomputed from them (PERSONALIZATION.md →
// calculated Profile defaults).
//
// No estimate is fabricated: any missing or out-of-range input returns null.

import type { ActivityLevel, Goal, Sex } from "./types";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
};

/** Accepted range for typed body inputs — checked at save and before any
 *  calculation. The equation is for adults, hence 18+. */
export const BODY_LIMITS = {
  age_years: { min: 18, max: 100 },
  height_cm: { min: 100, max: 250 },
  weight_kg: { min: 30, max: 300 },
} as const;

export type BodyInputs = {
  sex: Sex | null;
  age_years: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
};

function inRange(value: number | null, { min, max }: { min: number; max: number }): value is number {
  return value !== null && Number.isFinite(value) && value >= min && value <= max;
}

/** Mifflin–St Jeor resting energy (kcal/day), unrounded; null if an input is
 *  missing or out of range. */
export function mifflinStJeorBmr(body: Pick<BodyInputs, "sex" | "age_years" | "height_cm" | "weight_kg">): number | null {
  const { sex, age_years, height_cm, weight_kg } = body;
  if (
    !sex ||
    !inRange(age_years, BODY_LIMITS.age_years) ||
    !inRange(height_cm, BODY_LIMITS.height_cm) ||
    !inRange(weight_kg, BODY_LIMITS.weight_kg)
  ) {
    return null;
  }
  return 10 * weight_kg + 6.25 * height_cm - 5 * age_years + (sex === "male" ? 5 : -161);
}

/** Total daily energy expenditure — BMR × activity factor, unrounded. */
export function tdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activity];
}

/** Conservative adjustment from maintenance, by goal. `null` for "Eat better":
 *  that goal's own promise is "no strict numbers", so only maintenance is shown. */
export const GOAL_ENERGY_ADJUSTMENT: Record<Goal, { target: number; low: number; high: number } | null> = {
  fat_loss: { target: -0.15, low: -0.2, high: -0.1 },
  maintain: { target: 0, low: -0.05, high: 0.05 },
  muscle_gain: { target: 0.1, low: 0.05, high: 0.15 },
  general_health: null,
};

/** A suggested daily intake is never below this, whatever the percentage says. */
export const MIN_SUGGESTED_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };

export type EnergyEstimate = {
  /** Resting energy, to the nearest 10 kcal. Not an eating target. */
  bmr: number;
  /** Estimated maintenance energy (TDEE), to the nearest 50 kcal. */
  maintenance: number;
  /** Suggested daily target for the goal; null for "Eat better". */
  suggested: { target: number; low: number; high: number; floorApplied: boolean } | null;
};

export function estimateEnergy(body: BodyInputs, goal: Goal): EnergyEstimate | null {
  const bmr = mifflinStJeorBmr(body);
  if (bmr === null || !body.activity_level || !body.sex) return null;
  const maintenance = tdee(bmr, body.activity_level);

  const adjustment = GOAL_ENERGY_ADJUSTMENT[goal];
  let suggested: EnergyEstimate["suggested"] = null;
  if (adjustment) {
    const floor = MIN_SUGGESTED_KCAL[body.sex];
    const at = (pct: number) => Math.max(floor, maintenance * (1 + pct));
    const target = at(adjustment.target);
    suggested = {
      target: roundTo(target, 50),
      low: roundTo(at(adjustment.low), 50),
      high: roundTo(at(adjustment.high), 50),
      floorApplied: maintenance * (1 + adjustment.target) < floor,
    };
  }
  return { bmr: roundTo(bmr, 10), maintenance: roundTo(maintenance, 50), suggested };
}

/** Rough grams of protein per kg of body weight, by goal — practical ranges
 *  from the sports-nutrition literature, not a precise requirement. */
export const PROTEIN_G_PER_KG: Record<Goal, { target: number; low: number; high: number }> = {
  general_health: { target: 1.2, low: 1.0, high: 1.4 },
  maintain: { target: 1.4, low: 1.2, high: 1.6 },
  fat_loss: { target: 1.8, low: 1.6, high: 2.0 },
  muscle_gain: { target: 1.8, low: 1.6, high: 2.0 },
};

/** Bounds of the Profile's protein slider; suggestions stay inside it. */
const PROTEIN_BOUNDS = { min: 60, max: 220 };

export type ProteinSuggestion = { target: number; low: number; high: number };

export function suggestProtein(weight_kg: number | null, goal: Goal): ProteinSuggestion | null {
  if (!inRange(weight_kg, BODY_LIMITS.weight_kg)) return null;
  const per = PROTEIN_G_PER_KG[goal];
  const grams = (factor: number) => clamp(roundTo(weight_kg * factor, 5), PROTEIN_BOUNDS.min, PROTEIN_BOUNDS.max);
  return { target: grams(per.target), low: grams(per.low), high: grams(per.high) };
}

/** What a recommendation should actually use. A manual value always wins;
 *  otherwise the suggestion; otherwise `fallback` (today's behavior). */
export function effectiveTarget(manual: number | null, suggested: number | null, fallback: number | null): number | null {
  return manual ?? suggested ?? fallback;
}

// ---------------------------------------------------------------------------
// The one place a profile becomes nutrition targets.
//
// Everything that sizes a meal — the recommender's prompt, the Me summary, the
// local re-scoring of cards on screen — reads THIS result, so they can never
// disagree. It adds no formulas of its own: it composes the ones above
// (Mifflin–St Jeor BMR → × activity factor = maintenance → a conservative goal
// adjustment; protein from per-kg ranges), and a manual value the user set
// always wins over the estimate. Nothing here is stored.
//
// Where a number is missing it is `null`, never invented — with one named
// exception: when there is no manual protein target and no weight to estimate
// one from, protein falls back to the long-standing 120 g, flagged
// `source: "fallback"` so callers can tell it is not the user's.
// ---------------------------------------------------------------------------

export type TargetSource = "manual" | "estimated";
export type NutritionRange = { target: number; low: number; high: number };

export type NutritionTargets = {
  /** The goal used (the user's, else the neutral internal default). */
  goal: Goal;
  goalIsSet: boolean;
  /** Resting energy. An intermediate step — never an eating target. */
  bmr: number | null;
  /** Estimated maintenance energy (TDEE). */
  maintenance: number | null;
  /** Goal-adjusted DAILY energy range. null for "Eat better" (no number is
   *  promised for that goal) unless the user set their own. */
  calories: (NutritionRange & { source: TargetSource; floorApplied: boolean }) | null;
  /** Daily protein range. Always present; see `source`. */
  protein: NutritionRange & { source: TargetSource | "fallback" };
  /** True when anything personal (a manual value, or body details complete
   *  enough to estimate) is behind these numbers — i.e. they can change a
   *  recommendation. False means every number is the system fallback. */
  personalized: boolean;
};

/** ± band shown around a manual number the user typed. */
const MANUAL_BAND = 0.05;
const MANUAL_PROTEIN_BAND = { low: 0.9, high: 1.1 };

export type NutritionProfile = BodyInputs & {
  goal: Goal | null;
  daily_calorie_target_kcal: number | null;
  protein_target_g: number | null;
};

export function calculateNutritionTargets(profile: NutritionProfile, fallbackProteinG: number): NutritionTargets {
  const goal: Goal = profile.goal ?? "general_health";
  const energy = estimateEnergy(profile, goal);
  const estimatedProtein = suggestProtein(profile.weight_kg, goal);

  let calories: NutritionTargets["calories"] = null;
  if (profile.daily_calorie_target_kcal !== null) {
    const t = profile.daily_calorie_target_kcal;
    calories = { target: t, low: roundTo(t * (1 - MANUAL_BAND), 50), high: roundTo(t * (1 + MANUAL_BAND), 50), source: "manual", floorApplied: false };
  } else if (energy?.suggested) {
    calories = { ...energy.suggested, source: "estimated" };
  }

  let protein: NutritionTargets["protein"];
  if (profile.protein_target_g !== null) {
    const t = profile.protein_target_g;
    protein = { target: t, low: roundTo(t * MANUAL_PROTEIN_BAND.low, 5), high: roundTo(t * MANUAL_PROTEIN_BAND.high, 5), source: "manual" };
  } else if (estimatedProtein) {
    protein = { ...estimatedProtein, source: "estimated" };
  } else {
    protein = { target: fallbackProteinG, low: roundTo(fallbackProteinG * 0.85, 5), high: roundTo(fallbackProteinG * 1.15, 5), source: "fallback" };
  }

  return {
    goal,
    goalIsSet: profile.goal !== null,
    bmr: energy?.bmr ?? null,
    maintenance: energy?.maintenance ?? null,
    calories,
    protein,
    personalized: calories !== null || protein.source !== "fallback",
  };
}

/** A short stable string of what the numbers are — two profiles that size
 *  meals identically have the same signature. Used to notice that targets
 *  changed since a set of cards was made. */
export function targetsSignature(t: NutritionTargets): string {
  return [t.goal, t.calories?.target ?? "-", t.protein.target, t.protein.source].join("|");
}

// ---------------------------------------------------------------------------
// Units. The app stores centimeters and kilograms only; US units are a display
// convenience in the Profile form.
// ---------------------------------------------------------------------------

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * CM_PER_INCH;

/** cm → whole feet and inches (inches rounded; 11.6 in carries into a foot). */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

/** One decimal is all the storage and the UI need. */
export const round1 = (value: number) => Math.round(value * 10) / 10;

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}
function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
