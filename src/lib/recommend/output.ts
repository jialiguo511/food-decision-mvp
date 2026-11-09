// What the model must return, and the checks it must pass before any of it
// reaches the UI. If anything here fails, the whole set is rejected — we fail
// visibly rather than render half a card. Both decision modes (cook / order)
// go through here, each with its own schema and constraint check.

import { z } from "zod";
import { findAllergenMentions } from "../foodTerms";
import type { PlaceCandidate } from "../places/candidates";
import { ingredientsOutsideInventory } from "./inventory";
import { findDietaryViolations, findNoCookViolations, findUnownedApplianceMentions, recipeText } from "./textChecks";
import type {
  ActiveConstraints,
  CookRecommendation,
  DecisionMode,
  DietaryConstraint,
  NearbyRecommendation,
  OrderRecommendation,
  Recommendation,
  RecommendationRole,
  RecommendSuccess,
  ViolationKind,
} from "../types";

/** Estimates are fuzzy, so "must not exceed" allows a small margin before a
 *  recommendation counts as breaking the constraint. Cook mode only —
 *  ordering has no minutes/budget to check. */
export const MINUTES_TOLERANCE = { minMinutes: 5, fraction: 0.2 };
export const BUDGET_TOLERANCE_FRACTION = 0.1;

const ROLES: readonly RecommendationRole[] = ["best_match", "lowest_effort", "alternative"];

/** Defends against a narrow, observed model artifact: the literal field name
 *  "image_query" — the schema key immediately after `steps` for a Cook
 *  recommendation — occasionally leaks in as a spurious extra entry in the
 *  `steps` array itself on generation, rendering as a bogus final numbered
 *  step ("6. image_query"; the number comes from RecipeCard's
 *  plain `<ol>`, not the model). Nothing in this codebase ever writes that
 *  string into `steps` — see prompt.ts's reinforced instruction, which
 *  addresses the cause, and this as the safety net for when it still slips
 *  through. Exact and case-insensitive on purpose: this removes only that
 *  one token, never any broader text filtering. Exported so session.ts can
 *  apply the same defense to a session saved before this fix shipped. */
export function stripLeakedImageQueryStep(steps: readonly string[]): string[] {
  return steps.filter((step) => step.trim().toLowerCase() !== "image_query");
}

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
  // One short caution tied to the user's confirmed nutrition priorities. Same
  // `.default(null)` reasoning as `modification`: required in the JSON schema
  // (null when there's nothing to flag) and lets older sessions still restore.
  watch: z.string().min(1).nullable().default(null),
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
  // One short caution tied to the user's confirmed nutrition priorities. Same
  // `.default(null)` reasoning as `modification`: required in the JSON schema
  // (null when there's nothing to flag) and lets older sessions still restore.
  watch: z.string().min(1).nullable().default(null),
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
  // One short caution tied to the user's confirmed nutrition priorities. Same
  // `.default(null)` reasoning as `modification`: required in the JSON schema
  // (null when there's nothing to flag) and lets older sessions still restore.
  watch: z.string().min(1).nullable().default(null),
  estimated_calories: z.number().int().nonnegative(),
  estimated_protein_g: z.number().int().nonnegative(),
});

/** What the model returns for one nearby pick: a reference to a candidate and
 *  two sentences of judgment — nothing else. Name, distance, hours, price,
 *  and the Maps link are copied from the provider's candidate server-side, so
 *  there is no field through which the model could put an invented place, a
 *  price, or a calorie count on screen.
 *
 *  Same `.min(1)` / no-transform rules as the other field sets, since this is
 *  also handed to zodOutputFormat. */
const nearbyPickFields = z.object({
  place_id: z.string().min(1).describe("Must be exactly one of the candidates' place_id values."),
  reason: z.string().min(1),
  look_for: z.string().min(1),
});

/** A nearby recommendation as stored in decision_sessions and read back. The
 *  place facts are stored verbatim from the candidate so a restored session
 *  renders without another provider call. `maps_url` is restricted to https
 *  because this is read back from the database and rendered as a link. */
const nearbyRecommendationFields = z.object({
  title: z.string().min(1),
  place_id: z.string().min(1),
  reason: z.string().min(1),
  look_for: z.string().min(1).nullable(),
  category: z.string().min(1).nullable(),
  address: z.string().min(1).nullable(),
  distance_m: z.number().int().nonnegative().nullable(),
  open_now: z.literal(true).nullable(),
  price_level: z.enum(["free", "inexpensive", "moderate", "expensive", "very_expensive"]).nullable(),
  maps_url: z.string().url().refine((url) => url.startsWith("https://"), "must be an https URL"),
  // Added after the first nearby sessions were saved: absent there, so it
  // defaults to null rather than making old sessions unreadable. http(s) only,
  // since it is read back from the database and rendered as a link.
  website_url: z
    .string()
    .url()
    .refine((url) => /^https?:\/\//.test(url), "must be an http(s) URL")
    .nullable()
    .default(null),
  // See NearbyRecommendation.enriched. Optional: absent on every earlier row.
  enriched: z.boolean().optional(),
  // Added later still; optional for the same reason. The name is later used in a
  // request path, so it must have exactly the provider's shape.
  photo_name: z
    .string()
    .regex(/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/)
    .nullable()
    .optional(),
  photo_author: z.string().min(1).max(60).nullable().optional(),
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

/**
 * The structured-output schema for an OPEN request (the person is fine with more
 * than one way of eating). Same shape as every other mode — one key per role, so
 * exactly three — but each slot may be a Cook, Get-food or Snack card, tagged with
 * `way`. Only the ways the person allows are offered to the model at all, so a
 * request that rules out cooking can't come back with a recipe. It is ONE model
 * call: the three ways are not generated separately and stitched together.
 */
export function buildOpenOutputSchema(ways: { cook: boolean; buy: boolean }) {
  const variants = [
    ...(ways.cook ? [cookRecommendationFields.extend({ way: z.literal("cook") })] : []),
    ...(ways.buy ? [orderRecommendationFields.extend({ way: z.literal("order") }), storeSnackRecommendationFields.extend({ way: z.literal("store_snack") })] : []),
  ];
  const slot = (variants.length > 1 ? z.union(variants as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]) : variants[0]) as z.ZodType<{ way: "cook" | "order" | "store_snack" } & Record<string, unknown>>;
  return z.object({ best_match: slot, lowest_effort: slot, alternative: slot });
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
export const storedRecommendationSchema = z.discriminatedUnion("decision_mode", [
  cookRecommendationFields.extend({ decision_mode: z.literal("cook"), role: z.enum(ROLES) }),
  orderRecommendationFields.extend({ decision_mode: z.literal("order"), role: z.enum(ROLES) }),
  storeSnackRecommendationFields.extend({ decision_mode: z.literal("store_snack"), role: z.enum(ROLES) }),
  nearbyRecommendationFields.extend({ decision_mode: z.literal("nearby"), role: z.enum(ROLES) }),
]);

export const storedRecommendationsSchema = z.array(storedRecommendationSchema).max(3);

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

  // Nearby never goes through here: its output is checked against the
  // request's candidates, which this function doesn't have. See
  // parseNearbyRecommendations.
  if (constraints.decision_mode === "nearby") {
    return { ok: false, code: "malformed_output", details: ["Nearby output must be parsed with parseNearbyRecommendations."] };
  }
  if (constraints.decision_mode === "open") return parseOpenRecommendations(json, constraints);
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
  // reaches the UI is only ever real recommendations. `"steps" in fields`
  // both narrows to the Cook shape and is the only shape that has steps to
  // sanitize — order/store-snack pass through untouched.
  const recommendations = ROLES.flatMap((role) => {
    const fields = parsed.data[role];
    if (!fields) return [];
    const sanitizedFields = "steps" in fields ? { ...fields, steps: stripLeakedImageQueryStep(fields.steps) } : fields;
    return [{ decision_mode: mode, role, ...sanitizedFields }];
  }) as Recommendation[];

  const emptiedBySanitization = recommendations.find(
    (r): r is CookRecommendation => r.decision_mode === "cook" && r.steps.length === 0,
  );
  if (emptiedBySanitization) {
    return {
      ok: false,
      code: "malformed_output",
      details: ["A recommendation's steps were empty after removing a stray internal field-name artifact."],
    };
  }

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

/** The words that name the food itself — what an allergen turning up in would
 *  be a violation — not the prose around it ("reason", "watch"). */
function foodTextOf(r: Recommendation): string {
  switch (r.decision_mode) {
    case "cook":
      return recipeText(r);
    case "order":
      return [r.title, ...r.search_terms, r.order_notes, r.modification ?? ""].join("\n");
    case "store_snack":
      return [r.title, r.what_to_look_for, r.backup ?? ""].join("\n");
    default:
      return "";
  }
}

/** The second safety layer behind the prompt's allergy rule, for every mode
 *  that generates food: an allergy the user listed may not appear by name in
 *  what is recommended. Literal only (foodTerms.findAllergenMentions: no aliases,
 *  no hidden ingredients), so it catches a slip, never proves a dish safe. */
function findAllergenViolations(recommendations: readonly Recommendation[], allergies: readonly string[]): string[] {
  if (allergies.length === 0) return [];
  return recommendations.flatMap((r) =>
    findAllergenMentions(foodTextOf(r), allergies).map((allergy) => `${r.role}: names ${allergy}, which the user is allergic to.`),
  );
}

export function findConstraintViolations(
  recommendations: readonly Recommendation[],
  constraints: ActiveConstraints,
  onHand: readonly string[] = [],
): string[] {
  if (constraints.decision_mode === "nearby") return []; // checked against its candidates instead — parseNearbyRecommendations
  if (constraints.decision_mode === "open") return findOpenConstraintViolations(recommendations, constraints);

  const allergens = findAllergenViolations(recommendations, constraints.allergies);
  if (constraints.decision_mode === "order" || constraints.decision_mode === "store_snack") {
    // Allergies are the one hard constraint checked in code for these modes.
    // There is no time/budget/equipment to check — no menu-price, grocery-price
    // or real-world availability data sits behind this product — and `avoid`
    // (dislikes) is soft free text the prompt is trusted with, with deliberately
    // no content validator, the same reasoning CLAUDE.md gives for protein and
    // calories.
    return allergens;
  }

  return [...findCookConstraintViolations(recommendations as readonly CookRecommendation[], constraints, onHand), ...allergens];
}

/** Which of the person's rules a set of findings (the strings above) broke, as an
 *  enumeration — what the error screen and the failure log say instead of the findings
 *  themselves, which quote food names. Keyed to the wording of this file's own messages;
 *  a test builds each kind from a real violation so the two cannot drift apart. */
export function violationKinds(details: readonly string[] | undefined): ViolationKind[] {
  const rules: [ViolationKind, RegExp][] = [
    ["allergy", /allergic to|allergen/i],
    ["diet", /dietary pattern/i],
    ["no_cook", /isn't a no-cooking meal/i],
    ["equipment", /equipment the user doesn't have|hasn't said they have/i],
    ["time", /min limit/i],
    ["budget", /over the \$\d+ budget/i],
    ["inventory", /inventory-only|isn't in the user's ingredients/i],
    ["ways", /doesn't want to cook|only cooking was allowed/i],
  ];
  const found = new Set<ViolationKind>();
  for (const detail of details ?? []) for (const [kind, pattern] of rules) if (pattern.test(detail)) found.add(kind);
  return [...found];
}

/** What the Cook checks read. A limit that is null was never stated by the person
 *  (open requests) and is not enforced — it is not replaced by a made-up number. */
type CookLimits = {
  max_minutes: number | null;
  budget_usd: number | null;
  equipment: string[];
  no_cooking: boolean;
  no_shopping: boolean;
  dietary: DietaryConstraint;
};

function findCookConstraintViolations(recommendations: readonly CookRecommendation[], constraints: CookLimits, onHand: readonly string[]): string[] {
  const minuteLimit =
    constraints.max_minutes === null
      ? Infinity
      : constraints.max_minutes + Math.max(MINUTES_TOLERANCE.minMinutes, Math.ceil(constraints.max_minutes * MINUTES_TOLERANCE.fraction));
  const costLimit = constraints.budget_usd === null ? Infinity : constraints.budget_usd * (1 + BUDGET_TOLERANCE_FRACTION);

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
    // The recipe's own words, not just its equipment field: a step like "heat
    // it in the microwave" leans on an appliance the field never listed.
    const text = recipeText(r);
    const mentioned = findUnownedApplianceMentions(text, constraints.equipment);
    if (mentioned.length > 0) {
      problems.push(`${r.role}: mentions ${mentioned.join(", ")}, which the user hasn't said they have.`);
    }
    // "No cooking at all" in Make something: assembled from ready-to-eat things.
    // Heat, or a bought hot meal, is Get food — rejected here, not left to the model.
    if (constraints.no_cooking) {
      const heat = findNoCookViolations(r);
      if (heat.length > 0) {
        problems.push(`${r.role}: isn't a no-cooking meal — it needs ${heat.join("; ")}.`);
      }
    }
    const dietary = findDietaryViolations(text, constraints.dietary);
    if (dietary.length > 0) {
      problems.push(`${r.role}: conflicts with the user's dietary pattern — ${dietary.join("; ")}.`);
    }
    return problems;
  });
}

/** An open set, parsed from the model's JSON: three cards, each tagged with the way
 *  it is, validated by the SAME checks its way gets everywhere else. */
function parseOpenRecommendations(json: unknown, constraints: Extract<ActiveConstraints, { decision_mode: "open" }>): ParseResult {
  const parsed = buildOpenOutputSchema(constraints.ways).safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { ok: false, code: "malformed_output", details };
  }
  const recommendations = ROLES.flatMap((role) => {
    const { way, ...fields } = parsed.data[role] as { way: "cook" | "order" | "store_snack" } & Record<string, unknown>;
    const sanitized = way === "cook" && Array.isArray(fields.steps) ? { ...fields, steps: stripLeakedImageQueryStep(fields.steps as string[]) } : fields;
    return [{ decision_mode: way, role, ...sanitized }];
  }) as Recommendation[];

  if (recommendations.some((r) => r.decision_mode === "cook" && r.steps.length === 0)) {
    return { ok: false, code: "malformed_output", details: ["A recommendation's steps were empty after removing a stray internal field-name artifact."] };
  }
  const titles = new Set(recommendations.map((r) => r.title.trim().toLowerCase()));
  if (titles.size !== recommendations.length) {
    return { ok: false, code: "malformed_output", details: ["The three recommendations are not different meals."] };
  }
  const violations = findConstraintViolations(recommendations, constraints);
  if (violations.length > 0) return { ok: false, code: "constraint_violation", details: violations };
  return { ok: true, recommendations, insufficientInventory: false };
}

/** What an open set must satisfy: the ways the person allowed, the allergy and diet
 *  rules on every card, and — for Cook cards only — the cooking limits they stated
 *  (equipment, no-cooking, time and purchase ceilings when given). */
function findOpenConstraintViolations(recommendations: readonly Recommendation[], constraints: Extract<ActiveConstraints, { decision_mode: "open" }>): string[] {
  const problems: string[] = [];
  for (const r of recommendations) {
    if (r.decision_mode === "cook" && !constraints.ways.cook) problems.push(`${r.role}: is a recipe, but the user doesn't want to cook.`);
    if ((r.decision_mode === "order" || r.decision_mode === "store_snack") && !constraints.ways.buy) problems.push(`${r.role}: is something to buy, but only cooking was allowed.`);
  }
  const cooks = recommendations.filter((r): r is CookRecommendation => r.decision_mode === "cook");
  if (cooks.length > 0 && constraints.cook) {
    problems.push(
      ...findCookConstraintViolations(
        cooks,
        { ...constraints.cook, no_shopping: false, dietary: constraints.dietary },
        [],
      ),
    );
  }
  return [...problems, ...findAllergenViolations(recommendations, constraints.allergies)];
}

// Re-exported so callers that only need the shape, not the union, don't have
// to import from types.ts too.
export type { CookRecommendation, OrderRecommendation };


// ---------------------------------------------------------------------------
// Nearby places
// ---------------------------------------------------------------------------

/** How many recommendations a nearby request must return: exactly three
 *  whenever three or more real candidates remain, otherwise all of them
 *  (truth beats three — PRODUCT.md → "Exactly 3"). Deterministic, and enforced
 *  in parseNearbyRecommendations, not left to the prompt. */
export function expectedNearbyCount(candidateCount: number): number {
  return Math.min(3, candidateCount);
}

/** Structured-output schema for "Find food near me". One key per role like
 *  every other mode. With three or more candidates every slot is required, so
 *  decoding itself can't under-return; with fewer, slots are nullable so the
 *  real number can be expressed without padding. */
export function buildNearbyOutputSchema(candidateCount: number) {
  const slot = candidateCount >= 3 ? nearbyPickFields : nearbyPickFields.nullable();
  return z.object({ best_match: slot, lowest_effort: slot, alternative: slot });
}

/** Text the model must never write about a place, because a places provider
 *  has no menu, price, or nutrition data behind it. Deliberately narrow and
 *  mechanical — this catches concrete fabricated *numbers* and quoted
 *  dish names, not general tone. The prompt is the primary defense; this is
 *  the backstop that keeps a violation off the screen. */
const FABRICATION_PATTERNS: { pattern: RegExp; what: string }[] = [
  { pattern: /[$€£]\s?\d/, what: "a price" },
  { pattern: /\b\d[\d.,]*\s?(?:dollars|usd|bucks)\b/i, what: "a price" },
  { pattern: /\b\d[\d,]*\s?(?:kcal|cals?|calories)\b/i, what: "a calorie count" },
  { pattern: /\b\d+(?:\.\d+)?\s?(?:g|grams)\s+(?:of\s+)?(?:protein|carbs?|carbohydrates?|fat)\b/i, what: "a macro amount" },
  { pattern: /["“”][^"“”]{3,}["“”]/, what: "a quoted (menu-item-style) name" },
];

/** What, if anything, in this text claims a price, nutrition figure, or
 *  named menu item. Exported for tests. */
export function findFabricatedMenuClaims(text: string): string[] {
  return FABRICATION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ what }) => what);
}

/**
 * Validates the model's raw text for a nearby request against the candidates
 * that request actually retrieved, and builds the stored recommendations by
 * copying place facts from those candidates. Rejects the WHOLE set — never
 * renders a partial one — when any pick:
 *  - references a place_id that is not in the candidate set (invented or
 *    misremembered place),
 *  - repeats a place already picked in another slot,
 *  - returns fewer than expectedNearbyCount(candidates) picks (e.g. two picks
 *    from ten candidates), or
 *  - states a price, calorie/macro figure, or quoted dish name, or
 *  - has a `reason` that names one of the user's allergens.
 *
 * A `look_for` that names one of the user's allergens is withheld (set to
 * null), not rejected and not rewritten: the place is real and valid, only the
 * food guidance is unsafe to show. This is a second layer behind the prompt's
 * allergy rule, matching the allergen's own name only (see findAllergenMentions)
 * — it cannot make any place or dish "safe".
 */
export function parseNearbyRecommendations(
  text: string,
  candidates: readonly PlaceCandidate[],
  allergies: readonly string[] = [],
): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "malformed_output", details: ["Response was not valid JSON."] };
  }

  const parsed = buildNearbyOutputSchema(candidates.length).safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { ok: false, code: "malformed_output", details };
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const picks = ROLES.flatMap((role) => {
    const pick = parsed.data[role];
    return pick ? [{ role, pick }] : [];
  });

  const problems: string[] = [];
  const seen = new Set<string>();
  for (const { role, pick } of picks) {
    if (!byId.has(pick.place_id)) problems.push(`${role}: place_id is not one of this request's candidates.`);
    else if (seen.has(pick.place_id)) problems.push(`${role}: repeats a place already recommended.`);
    seen.add(pick.place_id);

    for (const what of new Set([...findFabricatedMenuClaims(pick.reason), ...findFabricatedMenuClaims(pick.look_for)])) {
      problems.push(`${role}: text states ${what}, which the places data can't support.`);
    }
    // The reason is shown on every card, so it can't be withheld the way
    // look_for is; an allergen in it rejects the set like any other violation.
    if (findAllergenMentions(pick.reason, allergies).length > 0) {
      problems.push(`${role}: reason names one of the user's allergens.`);
    }
  }
  const expected = expectedNearbyCount(candidates.length);
  if (picks.length !== expected) {
    problems.push(`Returned ${picks.length} place(s) but ${expected} were required (${candidates.length} candidates).`);
  }
  if (problems.length > 0) return { ok: false, code: "malformed_output", details: problems };

  const recommendations = picks.map(({ role, pick }): NearbyRecommendation => {
    const place = byId.get(pick.place_id)!;
    return {
      decision_mode: "nearby",
      role,
      title: place.name,
      place_id: place.id,
      reason: pick.reason.trim(),
      look_for: findAllergenMentions(pick.look_for, allergies).length > 0 ? null : pick.look_for.trim(),
      category: place.category,
      address: place.address,
      distance_m: place.distance_m,
      open_now: place.open_now === true ? true : null,
      price_level: place.price_level,
      maps_url: place.maps_url,
      website_url: place.website_url,
    };
  });

  return { ok: true, recommendations, insufficientInventory: false };
}
