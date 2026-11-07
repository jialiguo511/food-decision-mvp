// Whether Home offers first-run setup. Setup is one short, skippable pass over
// explicit Profile fields — never repeated, never a gate on using the app, and
// it writes through the same profiles row the Me page edits (no second store).
// Founder-approved 2026-09-30 (UX V2); see PERSONALIZATION.md for how this
// squares with "not an onboarding interrogation".

import { estimateEnergy } from "./nutrition";
import { goalOrDefault, toProfileFormValues } from "./profile";

/** The key in profiles.prefs recording that setup was finished or skipped. */
export const ONBOARDING_PREF = "onboarding_completed_at";

/** The key recording that the optional "better portion and protein
 *  suggestions" step was finished or dismissed — it is offered once. */
export const NUTRITION_NUDGE_PREF = "nutrition_nudge_done_at";

/**
 * Where a user is with their *Profile* — and only the Profile. Whether they
 * have used a mode before is a separate question, answered by their past
 * sessions (`FormDefaults.remembered`), never by this. Deterministic, from the
 * stored row alone:
 *
 *   new      — never set up and nothing real in the Profile → first-run setup
 *   partial  — set up (or has data) but can't yet estimate energy
 *              and has no manual calorie target → the optional nutrition step is offered
 *   complete — has an energy estimate or a manual calorie target, or already dismissed
 *              the nutrition step → nothing is offered
 */
export type ProfileStage = "new" | "partial" | "complete";

export function profileStage(row: unknown): ProfileStage {
  if (needsOnboarding(row)) return "new";
  return offersNutritionStep(row) ? "partial" : "complete";
}

/** Whether Home may offer the optional nutrition step (once the user has seen
 *  value). Never for a user whose stored details already give an estimate or
 *  who set a calorie target by hand, so nobody re-enters what they already have. */
export function offersNutritionStep(row: unknown): boolean {
  if (row === null || row === undefined || typeof row !== "object" || Array.isArray(row)) return false;
  const prefs = (row as { prefs?: unknown }).prefs;
  if (prefs && typeof prefs === "object" && NUTRITION_NUDGE_PREF in prefs) return false;
  const v = toProfileFormValues(row);
  // A stored protein number is not evidence of anything: old rows all carry
  // the 120 g default. Only a hand-set calorie target counts as "already told us".
  if (v.daily_calorie_target_kcal !== null) return false;
  return estimateEnergy(v, goalOrDefault(v.goal)) === null;
}

/** True for a user with no profile row, or a row that is still essentially
 *  empty and has never been through setup. Anyone who has already told the
 *  Profile something real — or finished/skipped setup once — never sees it. */
export function needsOnboarding(row: unknown): boolean {
  if (row === null || row === undefined) return true;
  if (typeof row !== "object" || Array.isArray(row)) return false;
  const prefs = (row as { prefs?: unknown }).prefs;
  if (prefs && typeof prefs === "object" && ONBOARDING_PREF in prefs) return false;

  const v = toProfileFormValues(row);
  const untouched =
    v.goal === null &&
    v.allergies.length === 0 &&
    v.dislikes.length === 0 &&
    v.nutrition_priorities.length === 0 &&
    v.health_conditions.length === 0 &&
    v.cuisines.length === 0 &&
    v.dietary_patterns.length === 0 &&
    v.dietary_other === null &&
    v.budget_per_meal_usd === null &&
    v.default_cook_minutes === null &&
    v.fridge_size === null &&
    v.equipment === null &&
    v.age_years === null &&
    v.sex === null &&
    v.height_cm === null &&
    v.weight_kg === null &&
    v.activity_level === null;
  return untouched;
}
