// What the model must return, and the checks it must pass before any of it
// reaches the UI. If anything here fails, the whole set is rejected — we fail
// visibly rather than render half a card.

import { z } from "zod";
import type { ActiveConstraints, Recommendation, RecommendationRole, RecommendSuccess } from "../types";

/** Estimates are fuzzy, so "must not exceed" allows a small margin before a
 *  recommendation counts as breaking the constraint. */
export const MINUTES_TOLERANCE = { minMinutes: 5, fraction: 0.2 };
export const BUDGET_TOLERANCE_FRACTION = 0.1;

const ROLES: readonly RecommendationRole[] = ["best_match", "lowest_effort", "alternative"];

/** Fields common to every recommendation, regardless of source: freshly
 *  decoded from the model, or read back out of a stored decision_sessions
 *  row. `role` is added separately by each caller — see buildOutputSchema
 *  (keyed by role, no field needed) and storedRecommendationsSchema (role is
 *  part of each stored object, tagged when it was first parsed). */
const recommendationFields = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
  estimated_minutes: z.number().int().nonnegative(),
  estimated_meal_cost_usd: z.number().nonnegative(),
  estimated_extra_cost_usd: z.number().nonnegative(),
  estimated_calories: z.number().int().nonnegative(),
  estimated_protein_g: z.number().int().nonnegative(),
  ingredients_on_hand: z.array(z.string()),
  ingredients_needed: z.array(z.string()),
  equipment: z.array(z.string()).describe("Only items listed in hard_constraints.equipment."),
  steps: z.array(z.string().min(1)).min(1),
});

/**
 * The schema sent to the API as structured output. One key per role, rather
 * than an array, so the model cannot return two recommendations, four, or the
 * same role twice — required keys and closed objects survive the SDK's schema
 * transform and are enforced during decoding.
 *
 * Equipment is deliberately NOT an enum here: the SDK's transform demotes
 * `enum` to a description hint, so it would not actually be enforced. The
 * owned-equipment rule is checked in findConstraintViolations instead, where a
 * breach is reported as the constraint violation it is.
 */
export function buildOutputSchema() {
  return z.object({
    best_match: recommendationFields,
    lowest_effort: recommendationFields,
    alternative: recommendationFields,
  });
}

/** Validates a decision_sessions.recommendations value already in storage:
 *  the same per-recommendation shape above, each tagged with its role, exactly
 *  three of them. Used when restoring the most recent session on Today, so a
 *  corrupted or hand-edited row is discarded rather than rendered — the same
 *  "fail visibly" principle parseRecommendations applies to a fresh model
 *  response. */
export const storedRecommendationsSchema = z
  .array(recommendationFields.extend({ role: z.enum(ROLES) }))
  .length(3);

export type ParseResult =
  | { ok: true; recommendations: RecommendSuccess["recommendations"] }
  | { ok: false; code: "malformed_output" | "constraint_violation"; details: string[] };

/** Validate the model's raw text. The API constrains decoding to the schema,
 *  but a refusal, a truncation, or an SDK change can still hand us something
 *  else, so nothing is trusted until it passes here. */
export function parseRecommendations(text: string, constraints: ActiveConstraints): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "malformed_output", details: ["Response was not valid JSON."] };
  }

  const parsed = buildOutputSchema().safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { ok: false, code: "malformed_output", details };
  }

  const recommendations: RecommendSuccess["recommendations"] = [
    { role: "best_match", ...parsed.data.best_match },
    { role: "lowest_effort", ...parsed.data.lowest_effort },
    { role: "alternative", ...parsed.data.alternative },
  ];

  const titles = new Set(recommendations.map((r) => r.title.trim().toLowerCase()));
  if (titles.size !== ROLES.length) {
    return { ok: false, code: "malformed_output", details: ["The three recommendations are not different meals."] };
  }

  const violations = findConstraintViolations(recommendations, constraints);
  if (violations.length > 0) return { ok: false, code: "constraint_violation", details: violations };

  return { ok: true, recommendations };
}

export function findConstraintViolations(
  recommendations: readonly Recommendation[],
  constraints: ActiveConstraints,
): string[] {
  const minuteLimit =
    constraints.max_minutes +
    Math.max(MINUTES_TOLERANCE.minMinutes, Math.ceil(constraints.max_minutes * MINUTES_TOLERANCE.fraction));
  const costLimit = constraints.budget_usd * (1 + BUDGET_TOLERANCE_FRACTION);

  return recommendations.flatMap((r) => {
    const problems: string[] = [];
    if (r.estimated_minutes > minuteLimit) {
      problems.push(`${r.role}: ~${r.estimated_minutes} min is over the ${constraints.max_minutes} min limit.`);
    }
    // The budget is about money spent tonight. Food already owned never counts
    // against it, however valuable — so meal cost is deliberately not checked.
    if (r.estimated_extra_cost_usd > costLimit) {
      problems.push(`${r.role}: ~$${r.estimated_extra_cost_usd} to buy is over the $${constraints.budget_usd} budget.`);
    }
    // With no_cooking, constraints.equipment is empty, so any appliance counts.
    const unowned = r.equipment.filter((item) => !constraints.equipment.includes(item));
    if (unowned.length > 0) {
      problems.push(`${r.role}: uses equipment the user doesn't have (${unowned.join(", ")}).`);
    }
    return problems;
  });
}
