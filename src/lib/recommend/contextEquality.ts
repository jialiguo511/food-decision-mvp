// Whether two Today contexts represent the same request. Used to decide which
// action button Home shows and whether results on screen are stale — not a
// strict/canonical equality, just the fields that change what a request would
// return. `nearby` is a request flag rather than a form value, so it is ignored.

import { effectiveTravel } from "../places/travel";
import type { DecisionContext } from "../types";

export function contextsEqual(a: DecisionContext, b: DecisionContext): boolean {
  if (a.decision_mode !== b.decision_mode) return false;
  if (a.decision_mode === "cook" && b.decision_mode === "cook") {
    return (
      a.cook_minutes === b.cook_minutes &&
      a.hunger === b.hunger &&
      a.effort === b.effort &&
      a.shopping === b.shopping &&
      a.craving === b.craving &&
      a.budget_override_usd === b.budget_override_usd &&
      (a.minimize_purchases ?? false) === (b.minimize_purchases ?? false) &&
      arraysEqual(a.ingredients_on_hand, b.ingredients_on_hand)
    );
  }
  if (a.decision_mode === "order" && b.decision_mode === "order") {
    return (
      a.hunger === b.hunger &&
      a.craving_category === b.craving_category &&
      a.craving_note === b.craving_note &&
      a.method === b.method &&
      a.meal_budget === b.meal_budget &&
      // Compared as it would be searched: only Eat nearby reads it.
      effectiveTravel(a) === effectiveTravel(b)
    );
  }
  if (a.decision_mode === "store_snack" && b.decision_mode === "store_snack") {
    return a.hunger === b.hunger && a.craving_type === b.craving_type;
  }
  return false;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
