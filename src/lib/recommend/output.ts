// What the model must return, and the checks it must pass before any of it
// reaches the UI. If anything here fails, the whole set is rejected — we fail
// visibly rather than render half a card. Both decision modes (cook / order)
// go through here, each with its own schema and constraint check.

import { z } from "zod";
import { ingredientsOutsideInventory } from "./inventory";
import type {
  ActiveConstraints,
  CookRecommendation,
  DecisionMode,
  OrderRecommendation,
  Recommendation,
  RecommendationRole,
  RecommendSuccess,
} from "../types";

/** Estimates are fuzzy, so "must not exceed" allows a small margin before a
 *  recommendation counts as breaking the constraint. Cook mode only —
 *  ordering has no minutes/budget to check. */
export const MINUTES_TOLERANCE = { minMinutes: 5, fraction: 0.2 };
export const BUDGET_TOLERANCE_FRACTION = 0.1;

const ROLES: readonly RecommendationRole[] = ["best_match", "lowest_effort", "alternative"];

/** Fields for a cook recommendation, regardless of source: freshly decoded
 *  from the model, or read back out of a stored decision_sessions row. `role`
 *  and `decision_mode` are added separately by each caller. */
const cookRecommendationFields = z.object({
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
  // Same `.default(null)` reasoning as order's `modification` below. Also what
  // lets sessions saved before this field existed still restore.
  inventory_note: z.string().min(1).nullable().default(null),
  // Dish + key ingredients for later image lookup (e.g. "chicken spinach rice
  // bowl") — never a URL; see src/lib/images/provider.ts and PLAN.md → NEXT →
  // "Recipe visualization". `.nullable().default(null)` for the same reason
  // as inventory_note above: lets sessions saved before this field existed
  // still restore. Cook-only for now — order/store-snack recommendations
  // aren't given this field yet, since they'll likely need a different image
  // source (menu photo, product photo) rather than sharing this contract.
  image_query: z.string().min(1).nullable().default(null),
});

/** Fields for an order recommendation — a meal category, not a recipe. No
 *  steps, ingredients, equipment, or cost: there is no real menu-price data
 *  behind this product. */
const orderRecommendationFields = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
  search_terms: z.array(z.string().min(1)).min(1).max(4),
  order_notes: z.string().min(1),
  // `.default(null)` rather than `.optional()`: this schema is also handed
  // to zodOutputFormat to constrain the model's decoding, and a `.transform()`
  // there throws ("Transforms cannot be represented in JSON Schema") — a
  // `.default()` doesn't, and it keeps the field required in the JSON
  // schema (the model always returns it, null when there's no modification)
  // while still giving `modification: string | null` here, matching
  // OrderRecommendation, with no undefined to normalize afterward.
  modification: z.string().min(1).nullable().default(null),
  estimated_calories: z.number().int().nonnegative(),
  estimated_protein_g: z.number().int().nonnegative(),
});

/** Fields for a store-snack recommendation — a ready-to-buy item, not a
 *  recipe or a delivery-app search term. No cost fields: same reasoning as
 *  the order flow's missing menu prices. */
const storeSnackRecommendationFields = z.object({
  title: z.string().min(1),
  reason: z.string().min(1),
  what_to_look_for: z.string().min(1),
  // Same `.default(null)` reasoning as order's `modification` above.
  backup: z.string().min(1).nullable().default(null),
  estimated_calories: z.number().int().nonnegative(),
  estimated_protein_g: z.number().int().nonnegative(),
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
 *
 * `allowFewer` is for strict "Use what I have" only: all three slots may then
 * be null (down to zero recommendations, via `insufficient_inventory: true`,
 * when the user's ingredients can't reasonably make anything), so the model
 * returns only what the ingredients actually support instead of inventing a
 * missing one to fill a slot. Everywhere else the three required keys still
 * make "exactly three" impossible to violate.
 */
export function buildOutputSchema(mode: DecisionMode, options: { allowFewer?: boolean } = {}) {
  if (mode === "cook" && options.allowFewer) {
    return z.object({
      // True only when nothing on hand adds up to a reasonable meal — see the
      // "Strict inventory rules" prompt section. All three slots are null then.
      insufficient_inventory: z.boolean(),
      best_match: cookRecommendationFields.nullable(),
      lowest_effort: cookRecommendationFields.nullable(),
      alternative: cookRecommendationFields.nullable(),
    });
  }
  const fields =
    mode === "cook"
      ? cookRecommendationFields
      : mode === "order"
        ? orderRecommendationFields
        : storeSnackRecommendationFields;
  return z.object({
    best_match: fields,
    lowest_effort: fields,
    alternative: fields,
  });
}

/** Validates a decision_sessions.recommendations value already in storage:
 *  the same per-recommendation shape above, each tagged with its role and
 *  decision_mode — three of them, or 0–3 for a strict "Use what I have"
 *  session (see buildOutputSchema; fresh output for every other mode is
 *  already exactly three). Used when restoring the most recent
 *  session on Today, so a corrupted or hand-edited row is discarded rather
 *  than rendered — the same "fail visibly" principle parseRecommendations
 *  applies to a fresh model response. A discriminated union so cook and order
 *  rows both validate through one schema. */
export const storedRecommendationsSchema = z
  .array(
    z.discriminatedUnion("decision_mode", [
      cookRecommendationFields.extend({ decision_mode: z.literal("cook"), role: z.enum(ROLES) }),
      orderRecommendationFields.extend({ decision_mode: z.literal("order"), role: z.enum(ROLES) }),
      storeSnackRecommendationFields.extend({ decision_mode: z.literal("store_snack"), role: z.enum(ROLES) }),
    ]),
  )
  .max(3);

export type ParseResult =
  | { ok: true; recommendations: RecommendSuccess["recommendations"]; insufficientInventory: boolean }
  | { ok: false; code: "malformed_output" | "constraint_violation"; details: string[] };

/** Validate the model's raw text. The API constrains decoding to the schema,
 *  but a refusal, a truncation, or an SDK change can still hand us something
 *  else, so nothing is trusted until it passes here. */
export function parseRecommendations(
  text: string,
  constraints: ActiveConstraints,
  /** The user's ingredients for tonight. Only read for strict "Use what I
   *  have" (no_shopping) — see findCookConstraintViolations. */
  onHand: readonly string[] = [],
): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "malformed_output", details: ["Response was not valid JSON."] };
  }

  const mode = constraints.decision_mode;
  const allowFewer = constraints.decision_mode === "cook" && constraints.no_shopping;
  const parsed = buildOutputSchema(mode, { allowFewer }).safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { ok: false, code: "malformed_output", details };
  }

  // Empty slots (null, only possible when allowFewer) are dropped, so what
  // reaches the UI is only ever real recommendations.
  const recommendations = ROLES.flatMap((role) => {
    const fields = parsed.data[role];
    return fields ? [{ decision_mode: mode, role, ...fields }] : [];
  }) as Recommendation[];

  const titles = new Set(recommendations.map((r) => r.title.trim().toLowerCase()));
  if (titles.size !== recommendations.length) {
    return { ok: false, code: "malformed_output", details: ["The three recommendations are not different meals."] };
  }

  const violations = findConstraintViolations(recommendations, constraints, onHand);
  if (violations.length > 0) return { ok: false, code: "constraint_violation", details: violations };

  // Only trust the flag when it agrees with what was actually returned — a
  // model that sets it but still fills a slot has produced something usable,
  // so show that rather than discard it over a self-contradiction.
  const insufficientInventory =
    allowFewer &&
    "insufficient_inventory" in parsed.data &&
    parsed.data.insufficient_inventory === true &&
    recommendations.length === 0;

  return { ok: true, recommendations, insufficientInventory };
}

export function findConstraintViolations(
  recommendations: readonly Recommendation[],
  constraints: ActiveConstraints,
  onHand: readonly string[] = [],
): string[] {
  if (constraints.decision_mode === "order" || constraints.decision_mode === "store_snack") {
    // No time/budget/equipment to check — there is no menu-price, grocery-
    // price, or real-world availability data behind this product. `avoid` is
    // free-text (dislikes read against a generated title/reason), the same as
    // every other soft-preference-shaped free text the prompt is trusted
    // with, and there is deliberately no server-side content validator for
    // it — the same reasoning CLAUDE.md gives for protein and calories.
    return [];
  }

  return findCookConstraintViolations(recommendations as readonly CookRecommendation[], constraints, onHand);
}

function findCookConstraintViolations(
  recommendations: readonly CookRecommendation[],
  constraints: Extract<ActiveConstraints, { decision_mode: "cook" }>,
  onHand: readonly string[],
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
    // Stricter than the cost check above, and checked independently of it:
    // "Use what I have" means zero purchases, not just a low estimate. This
    // catches the model reporting $0 while still listing something needed —
    // the two fields disagreeing is itself a sign the recommendation isn't
    // actually inventory-only.
    if (constraints.no_shopping && r.ingredients_needed.length > 0) {
      problems.push(
        `${r.role}: needs ${r.ingredients_needed.join(", ")} to buy, but inventory-only was requested.`,
      );
    }
    // The other way to break inventory-only: keeping ingredients_needed empty
    // while listing something the user doesn't have under ingredients_on_hand.
    // Anything there must be in tonight's ingredients or one of the staples.
    if (constraints.no_shopping) {
      const invented = r.ingredients_on_hand.flatMap((line) => ingredientsOutsideInventory(line, onHand));
      if (invented.length > 0) {
        problems.push(`${r.role}: uses ${invented.join(", ")}, which isn't in the user's ingredients.`);
      }
    }
    // With no_cooking, constraints.equipment is empty, so any appliance counts.
    const unowned = r.equipment.filter((item) => !constraints.equipment.includes(item));
    if (unowned.length > 0) {
      problems.push(`${r.role}: uses equipment the user doesn't have (${unowned.join(", ")}).`);
    }
    return problems;
  });
}

// Re-exported so callers that only need the shape, not the union, don't have
// to import from types.ts too.
export type { CookRecommendation, OrderRecommendation };
