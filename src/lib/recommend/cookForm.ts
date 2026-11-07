// CookForm → MealContext. The form leaves an answer null until it is real
// (see CookForm), so this is where "answered" is decided, once: a request is
// only ever built from answers the user gave or a real earlier answer
// supplied. There is no fallback here on purpose.

import type { CookForm, MealContext } from "../types";

/** The first Cook answers still missing, in question order — empty when the
 *  form can become a request. A budget only counts when shopping is allowed. */
export function missingCookAnswers(form: CookForm): ("time_effort" | "shopping" | "budget")[] {
  const missing: ("time_effort" | "shopping" | "budget")[] = [];
  if (form.cook_minutes === null || form.effort === null) missing.push("time_effort");
  if (form.shopping === null) missing.push("shopping");
  else if (form.shopping === "can_buy" && form.budget_override_usd === null) missing.push("budget");
  return missing;
}

/** The request for a complete form, or null while anything is unanswered. */
export function toMealContext(form: CookForm): MealContext | null {
  if (missingCookAnswers(form).length > 0) return null;
  return { ...form, cook_minutes: form.cook_minutes as number, effort: form.effort as NonNullable<CookForm["effort"]>, shopping: form.shopping as NonNullable<CookForm["shopping"]> };
}
