// How well a recommendation's estimated calories and protein fit what THIS
// user's nutrition targets say one meal should be — a deterministic, soft
// score used to re-order cards already on screen when the user's targets
// change, so new nutrition details have a visible effect without another slow
// model call. It is a ranking signal only: never a limit, never a ledger. It
// has no idea what the user ate today and never says "left" or "over".
//
// Inputs are the cards' own estimates (themselves model guesses), so the score
// is coarse on purpose — rounded to tenths, with ties keeping the existing
// order, and a re-order only happens when the fit really differs.
//
// Meal shares reuse prompt.ts's MEAL_ENERGY_SHARE / SNACK_ENERGY_SHARE so the
// range the model is told to aim for and the range cards are scored against
// are the same numbers. Protein follows the prompt's "about a third of the
// day, somewhat more when very hungry, somewhat less when light".

import type { NutritionTargets } from "../nutrition";
import type { Hunger, Recommendation } from "../types";
import { MEAL_ENERGY_SHARE, SNACK_ENERGY_SHARE } from "./prompt";

export type MealKind = "meal" | "snack";

/** Share of the DAY's protein one meal should carry, by hunger. */
const PROTEIN_SHARE: Record<Hunger, readonly [number, number]> = {
  light: [0.2, 0.28],
  normal: [0.28, 0.38],
  very_hungry: [0.34, 0.46],
};
const SNACK_PROTEIN_SHARE: Record<Hunger, readonly [number, number]> = {
  light: [0.04, 0.08],
  normal: [0.07, 0.12],
  very_hungry: [0.1, 0.17],
};

const ENERGY_KEY: Record<Hunger, keyof typeof MEAL_ENERGY_SHARE> = { light: "light", normal: "normal", very_hungry: "substantial" };

export type MealTargets = {
  kcal: { low: number; high: number } | null;
  protein: { low: number; high: number } | null;
  /** How much each part counts in the score (sums to 1 when both exist). */
  weights: { kcal: number; protein: number };
};

/** One meal's size, from the daily targets. null when nothing personal is
 *  behind the targets (every number a fallback) — then there is nothing to
 *  score against and no card may be re-ordered on this basis. */
export function mealTargetsFor(targets: NutritionTargets, hunger: Hunger, kind: MealKind = "meal"): MealTargets | null {
  if (!targets.personalized) return null;
  const energy = (kind === "meal" ? MEAL_ENERGY_SHARE : SNACK_ENERGY_SHARE)[ENERGY_KEY[hunger]];
  const proteinShare = (kind === "meal" ? PROTEIN_SHARE : SNACK_PROTEIN_SHARE)[hunger];

  const kcal = targets.calories ? { low: targets.calories.target * energy[0], high: targets.calories.target * energy[1] } : null;
  // A fallback protein number (no manual value, no weight) is not the user's.
  const protein = targets.protein.source === "fallback" ? null : { low: targets.protein.target * proteinShare[0], high: targets.protein.target * proteinShare[1] };
  if (!kcal && !protein) return null;

  const goal = targets.goal;
  const weights =
    kcal && protein
      ? goal === "fat_loss"
        ? { kcal: 0.6, protein: 0.4 }
        : goal === "muscle_gain"
          ? { kcal: 0.35, protein: 0.65 }
          : { kcal: 0.5, protein: 0.5 }
      : { kcal: kcal ? 1 : 0, protein: protein ? 1 : 0 };
  return { kcal, protein, weights };
}

export type Fit = "low" | "in" | "high";

export type MealFit = {
  /** 0–1, rounded to a tenth. */
  score: number;
  calories: Fit | null;
  protein: Fit | null;
};

/** Distance outside [low, high] as a 0–1 penalty: 0 inside, 1 at `tolerance`
 *  × the bound away. */
function outside(value: number, low: number, high: number, tolerance: number): { penalty: number; fit: Fit } {
  if (value < low) return { penalty: Math.min(1, (low - value) / (low * tolerance)), fit: "low" };
  if (value > high) return { penalty: Math.min(1, (value - high) / (high * tolerance)), fit: "high" };
  return { penalty: 0, fit: "in" };
}

export function scoreMealFit(rec: { estimated_calories: number; estimated_protein_g: number }, meal: MealTargets): MealFit {
  let score = 0;
  let calories: Fit | null = null;
  let protein: Fit | null = null;

  if (meal.kcal) {
    const { penalty, fit } = outside(rec.estimated_calories, meal.kcal.low, meal.kcal.high, 0.5);
    score += meal.weights.kcal * (1 - penalty);
    calories = fit;
  }
  if (meal.protein) {
    const { penalty, fit } = outside(rec.estimated_protein_g, meal.protein.low, meal.protein.high, 0.6);
    // More protein than the range is not automatically better — but it is a
    // much smaller miss than too little (half the penalty).
    score += meal.weights.protein * (1 - (fit === "high" ? penalty * 0.5 : penalty));
    protein = fit;
  }
  return { score: Math.round(score * 10) / 10, calories, protein };
}

type Scorable = Extract<Recommendation, { estimated_calories: number }>;
const hasNutrition = (r: Recommendation): r is Scorable => "estimated_calories" in r && "estimated_protein_g" in r;

export type Reranked<T> = { recommendations: T[]; changed: boolean; fits: (MealFit | null)[] };

/**
 * The same cards, best nutrition fit first. Stable: equal scores keep their
 * current order, so a profile that makes no difference changes nothing. Cards
 * with no nutrition estimates (nearby places) score null and stay where they
 * are relative to each other. Never adds, removes or relabels a card — each
 * keeps its role, so "Lowest effort" still means that wherever it lands.
 */
export function rankByNutritionFit<T extends Recommendation>(recs: readonly T[], meal: MealTargets | null): Reranked<T> {
  if (!meal) return { recommendations: [...recs], changed: false, fits: recs.map(() => null) };
  const fits = recs.map((r) => (hasNutrition(r) ? scoreMealFit(r, meal) : null));
  const order = recs.map((_, i) => i).sort((a, b) => (fits[b]?.score ?? 0) - (fits[a]?.score ?? 0) || a - b);
  return {
    recommendations: order.map((i) => recs[i]),
    changed: order.some((original, position) => original !== position),
    fits: order.map((i) => fits[i]),
  };
}
