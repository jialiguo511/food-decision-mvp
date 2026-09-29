// How a coarse Google Places price level relates to the user's eat-out meal
// budget. Deliberately a ranking hint, never a price: a price level is a
// provider-wide band, not a menu price, and nothing here knows what a meal
// costs, what delivery adds, or what tax and tip will be. The UI and the model
// may say "more likely to fit" or "may run over"; neither may state a dollar
// amount or promise a total.

import { FEASIBILITY } from "../places/config";
import type { MealBudget, PlacePriceLevel } from "../types";

export type BudgetFit = "likely_fit" | "may_be_over" | "unlikely_fit";

/** The price level a band comfortably covers, on the same scale as LEVEL_RANK.
 *  Google's own level definitions run roughly: inexpensive ≈ up to ~$10 a
 *  person, moderate ≈ ~$10–20, expensive ≈ ~$20–30, very expensive ≈ $30+ —
 *  so each band lines up with the level whose range it mostly contains. */
const BAND_CEILING: Record<Exclude<MealBudget, "no_preference">, number> = {
  under_15: 1,
  "15_to_25": 2,
  "25_to_40": 3,
};

const LEVEL_RANK: Record<PlacePriceLevel, number> = {
  free: 0,
  inexpensive: 1,
  moderate: 2,
  expensive: 3,
  very_expensive: 4,
};

/** null means "no signal": the user has no budget preference, or the provider
 *  gave no price level. Unknown price is never treated as expensive — a place
 *  with no price level stays fully eligible and other signals decide. */
export function budgetFit(budget: MealBudget, priceLevel: PlacePriceLevel | null): BudgetFit | null {
  if (budget === "no_preference" || priceLevel === null) return null;
  const overBy = LEVEL_RANK[priceLevel] - BAND_CEILING[budget];
  if (overBy <= 0) return "likely_fit";
  return overBy === 1 ? "may_be_over" : "unlikely_fit";
}

/** The budget's contribution to a candidate's feasibility score. A soft
 *  ranking nudge only: an unknown price is 0 (neutral), a roomier budget never
 *  penalizes a cheap place (likely_fit is 0), and only the tightest band gives
 *  a bonus, to a clearly low price level. */
export function budgetScore(budget: MealBudget, priceLevel: PlacePriceLevel | null): number {
  const fit = budgetFit(budget, priceLevel);
  if (fit === null) return 0;
  if (fit === "unlikely_fit") return FEASIBILITY.budget_unlikely_fit;
  if (fit === "may_be_over") return FEASIBILITY.budget_may_be_over;
  return budget === "under_15" ? FEASIBILITY.budget_low_fit_bonus : 0;
}
