// Health conditions and nutrition priorities — two separate concepts.
//
// A condition is optional context the user shares. It NEVER drives the
// recommender: the only thing it can do is suggest a priority, which the user
// must explicitly confirm. The recommender reads confirmed priorities only, so
// no disease-specific diet logic exists anywhere in the product. Unsupported
// conditions can't be stored (unknown values are dropped on read and save) and
// nothing is ever inferred from behavior.

import { HEALTH_CONDITIONS, NUTRITION_PRIORITIES } from "./options";
import type { HealthCondition, NutritionPriority } from "./types";

/** The whole mapping. One condition suggests one priority. */
export const CONDITION_SUGGESTS_PRIORITY: Record<HealthCondition, NutritionPriority> = {
  high_blood_pressure: "lower_sodium",
  prediabetes_or_diabetes: "limit_added_sugar",
  high_cholesterol: "lower_saturated_fat",
};

/** Priorities the selected conditions suggest that the user has NOT yet
 *  confirmed — what the Profile offers as a one-tap "use it". Pure: it never
 *  changes `confirmed`. */
export function suggestedPriorities(
  conditions: readonly HealthCondition[],
  confirmed: readonly NutritionPriority[],
): NutritionPriority[] {
  const out: NutritionPriority[] = [];
  for (const condition of conditions) {
    const priority = CONDITION_SUGGESTS_PRIORITY[condition];
    if (priority && !confirmed.includes(priority) && !out.includes(priority)) out.push(priority);
  }
  return out;
}

const CONDITION_VALUES: readonly string[] = HEALTH_CONDITIONS.map((c) => c.value);
const PRIORITY_VALUES: readonly string[] = NUTRITION_PRIORITIES.map((p) => p.value);

/** Keeps only supported, de-duplicated values, in first-seen order. Anything
 *  else (an unknown string, a condition we don't support) is dropped. */
export function sanitizeConditions(value: unknown): HealthCondition[] {
  return sanitize(value, CONDITION_VALUES) as HealthCondition[];
}
export function sanitizePriorities(value: unknown): NutritionPriority[] {
  return sanitize(value, PRIORITY_VALUES) as NutritionPriority[];
}

function sanitize(value: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((v): v is string => typeof v === "string" && allowed.includes(v))));
}
