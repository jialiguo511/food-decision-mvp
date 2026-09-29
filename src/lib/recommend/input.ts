// Turns what we know about the user into the context object the recommender
// sees. Hard constraints and soft preferences are kept in separate sections on
// purpose: the prompt treats the first as non-negotiable and the second as
// ranking signals, and mixing them is how a craving ends up overriding a
// dislike.
//
// Both decision modes (cook / order) go through this file, discriminated on
// `decision_mode` throughout — see types.ts.

import { z } from "zod";
import { DEFAULT_PROFILE, EQUIPMENT, FRIDGE_SIZES, GOALS, MEAL_BUDGETS, ORDER_CRAVINGS, ORDER_METHODS, STORE_SNACK_CRAVINGS } from "../options";
import type {
  ActiveConstraints,
  CravingType,
  DecisionContext,
  Effort,
  FridgeSize,
  Goal,
  Hunger,
  MealBudget,
  MealContext,
  OrderContext,
  OrderCravingCategory,
  OrderMethod,
  ProfileInput,
  Recommendation,
  RecommendationRole,
  StoreSnackContext,
} from "../types";
import type { PlaceCandidate } from "../places/candidates";
import { budgetFit, type BudgetFit } from "./budget";
import { storedRecommendationsSchema } from "./output";

const NO_COOKING = "No cooking at all";

/** The dynamic context for "I can cook", as sent from Today. It comes from
 *  the browser, so nothing in it is trusted until it passes this schema. */
export const cookContextSchema = z.object({
  decision_mode: z.literal("cook"),
  cook_minutes: z.number().int().min(5).max(180),
  hunger: z.enum(["light", "normal", "very_hungry"]),
  effort: z.enum(["minimal", "some", "happy_to_cook"]),
  shopping: z.enum(["inventory_only", "can_buy"]),
  craving: z
    .string()
    .max(200)
    .nullable()
    .transform((value) => value?.trim().replace(/\s+/g, " ") || null),
  ingredients_on_hand: z.array(z.string().trim().min(1).max(60)).max(40),
  // 0 is valid and meaningful — "no additional spending" — not just excluded
  // as a degenerate slider value. See CookConstraints.budget_usd.
  budget_override_usd: z.number().min(0).max(100).nullable(),
  minimize_purchases: z.boolean().optional(),
}) satisfies z.ZodType<MealContext>;

const orderCravingCategories = ORDER_CRAVINGS.map((c) => c.value) as [OrderCravingCategory, ...OrderCravingCategory[]];
const orderMethods = ORDER_METHODS.map((m) => m.value) as [OrderMethod, ...OrderMethod[]];
const mealBudgets = MEAL_BUDGETS.map((b) => b.value) as [MealBudget, ...MealBudget[]];

/** The dynamic context for "I want to order food". Deliberately smaller than
 *  cookContextSchema — see OrderContext in types.ts. */
export const orderContextSchema = z.object({
  decision_mode: z.literal("order"),
  hunger: z.enum(["light", "normal", "very_hungry"]),
  craving_category: z.enum(orderCravingCategories),
  craving_note: z
    .string()
    .max(200)
    .nullable()
    .transform((value) => value?.trim().replace(/\s+/g, " ") || null),
  method: z.enum(orderMethods),
  // Total food budget for this meal — NOT the Cook budget (extra spend on
  // missing ingredients). Missing means "no strong preference", so a stale
  // page or a session saved before this field existed still works; an
  // explicitly provided value must still be one of the bands.
  meal_budget: z
    .enum(mealBudgets)
    .optional()
    .transform((value): MealBudget => value ?? "no_preference"),
  // Optional so sessions saved before "Find food near me" still restore.
  nearby: z.boolean().optional(),
  // Input is `unknown`: meal_budget (and nearby) may be absent from older payloads.
}) satisfies z.ZodType<OrderContext, unknown>;

const cravingTypes = STORE_SNACK_CRAVINGS.map((c) => c.value) as [CravingType, ...CravingType[]];

/** The dynamic context for "grab a snack". Deliberately the smallest of the
 *  three — see StoreSnackContext in types.ts. */
export const storeSnackContextSchema = z.object({
  decision_mode: z.literal("store_snack"),
  hunger: z.enum(["light", "normal", "very_hungry"]),
  craving_type: z.enum(cravingTypes),
}) satisfies z.ZodType<StoreSnackContext>;

/** Any of Today's three dynamic contexts. */
export const contextSchema = z.discriminatedUnion("decision_mode", [
  cookContextSchema,
  orderContextSchema,
  storeSnackContextSchema,
]);

/** The full POST /api/recommend body. `previous_recommendations` is only ever
 *  sent by "Show me 3 more" — the exact set the user is asking to move away
 *  from, so the model can avoid near-duplicates instead of minor variations.
 *  It reuses storedRecommendationsSchema rather than a parallel shape: it's
 *  the same "three recommendations already in decision_sessions" data,
 *  round-tripped from the client instead of read back from the database. */
export const recommendRequestSchema = z.object({
  context: contextSchema,
  previous_recommendations: storedRecommendationsSchema.optional(),
  // Only meaningful with an order context whose `nearby` is true. Used to
  // fulfil this one request and then dropped: it is never written to the
  // database, the session's context, or the Profile.
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

type SoftGoalPreferences = {
  goal: Goal;
  daily_protein_target_g: number;
  daily_calorie_target_kcal: number | null;
};

export type CookRecommendationInput = {
  decision_mode: "cook";
  hard_constraints: Extract<ActiveConstraints, { decision_mode: "cook" }>;
  soft_preferences: SoftGoalPreferences & {
    preferred_cuisines: string[];
    craving: string | null;
    ingredients_on_hand: string[];
    /** True only for the "Show me what to buy" fallback — see
     *  MealContext.minimize_purchases. Always false when no_shopping. */
    minimize_purchases: boolean;
    hunger: Hunger;
    effort: Effort;
    fridge_size: FridgeSize;
    fridge_note: string;
  };
  /** Present only for "Show me 3 more". Trimmed to what matters for telling
   *  the model what to avoid — no numbers, so it can't be mistaken for
   *  another constraint. */
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
};

export type OrderRecommendationInput = {
  decision_mode: "order";
  hard_constraints: Extract<ActiveConstraints, { decision_mode: "order" }>;
  soft_preferences: SoftGoalPreferences & {
    preferred_cuisines: string[];
    hunger: Hunger;
    craving_category: OrderCravingCategory;
    craving_note: string | null;
    method: OrderMethod;
    /** Approximate total budget for this meal — a feasibility ranking signal,
     *  not a price the model may quote. See MealBudget. */
    meal_budget: MealBudget;
  };
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
};

export type StoreSnackRecommendationInput = {
  decision_mode: "store_snack";
  hard_constraints: Extract<ActiveConstraints, { decision_mode: "store_snack" }>;
  soft_preferences: SoftGoalPreferences & {
    hunger: Hunger;
    craving_type: CravingType;
  };
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
};

/** One real place, as the model sees it: an id to refer to it by, and only
 *  the facts the decision uses. No address, coordinates, or link — the model
 *  doesn't need them and never outputs them. */
export type ModelCandidate = {
  place_id: string;
  name: string;
  category: string | null;
  /** Approximate straight-line meters from the user; null if unknown. */
  distance_m: number | null;
  /** true = the provider says open now; null = unknown. Never false — known-
   *  closed places are removed before this list is built. */
  open_now: true | null;
  /** Coarse provider price level, or null when the provider gave none. */
  price_level: PlaceCandidate["price_level"];
  /** How that price level sits against the user's meal budget — computed here,
   *  not judged by the model. null when there is no budget preference or the
   *  provider gave no price level (unknown, neither a plus nor a minus). */
  budget_fit: BudgetFit | null;
};

export type NearbyRecommendationInput = {
  decision_mode: "nearby";
  hard_constraints: Extract<ActiveConstraints, { decision_mode: "nearby" }>;
  soft_preferences: SoftGoalPreferences & {
    preferred_cuisines: string[];
    /** Profile "disliked foods": a strong negative ranking signal, NOT an
     *  allergy or restriction and never a safety constraint. */
    disliked_foods: string[];
    hunger: Hunger;
    craving_category: OrderCravingCategory;
    craving_note: string | null;
    method: OrderMethod;
    /** Approximate total budget for this meal. Only usable against a candidate
     *  that has a real price_level (see each candidate's `budget_fit`). This is
     *  deliberately not the profile's Cook budget, which caps extra spend on
     *  missing ingredients. */
    meal_budget: MealBudget;
  };
  /** The ONLY places that may be recommended — this request's provider
   *  results, after filtering. */
  candidates: ModelCandidate[];
};

export type RecommendationInput =
  | CookRecommendationInput
  | OrderRecommendationInput
  | StoreSnackRecommendationInput
  | NearbyRecommendationInput;

/** The nearby counterpart of resolveRecommendationInput: same profile, same
 *  order-flow context, plus the real candidates the provider returned. Kept
 *  separate so the profile → soft-preferences mapping is the only thing shared
 *  with future personalization, not the Places plumbing. */
export function resolveNearbyInput(
  profile: ProfileInput,
  context: OrderContext,
  candidates: readonly PlaceCandidate[],
): NearbyRecommendationInput {
  return {
    decision_mode: "nearby",
    // No dedicated allergy/dietary-restriction field exists yet, so there are
    // no hard constraints to state. Dislikes are soft — see NearbyConstraints.
    hard_constraints: { decision_mode: "nearby" },
    soft_preferences: {
      goal: profile.goal,
      daily_protein_target_g: profile.protein_target_g,
      daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
      preferred_cuisines: profile.cuisines,
      disliked_foods: profile.dislikes,
      hunger: context.hunger,
      craving_category: context.craving_category,
      craving_note: context.craving_note,
      method: context.method,
      meal_budget: context.meal_budget,
    },
    candidates: candidates.map((c) => ({
      place_id: c.id,
      name: c.name,
      category: c.category,
      distance_m: c.distance_m,
      open_now: c.open_now === true ? true : null,
      price_level: c.price_level,
      budget_fit: budgetFit(context.meal_budget, c.price_level),
    })),
  };
}

export function resolveRecommendationInput(
  profile: ProfileInput,
  context: DecisionContext,
  previousRecommendations?: readonly Recommendation[],
  /** The user's persistent Kitchen staples (see kitchen_staples) — condiments
   *  and seasonings only, never actual food. Cook mode only. The canonical
   *  availability rule for "Use what I have" and every other cook request:
   *  availableIngredients = context.ingredients_on_hand (tonight's foods) +
   *  kitchenStaples, nothing else. Today's foods are never persisted and
   *  never carried into a later session — see MealContext.ingredients_on_hand. */
  kitchenStaples: readonly string[] = [],
): RecommendationInput {
  const previous =
    previousRecommendations && previousRecommendations.length > 0
      ? previousRecommendations.map((r) => ({ role: r.role, title: r.title, reason: r.reason }))
      : undefined;

  if (context.decision_mode === "order") {
    return {
      decision_mode: "order",
      hard_constraints: { decision_mode: "order", avoid: profile.dislikes },
      soft_preferences: {
        goal: profile.goal,
        daily_protein_target_g: profile.protein_target_g,
        daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
        preferred_cuisines: profile.cuisines,
        hunger: context.hunger,
        craving_category: context.craving_category,
        craving_note: context.craving_note,
        method: context.method,
        meal_budget: context.meal_budget,
      },
      ...(previous ? { previous_recommendations: previous } : {}),
    };
  }

  if (context.decision_mode === "store_snack") {
    return {
      decision_mode: "store_snack",
      hard_constraints: { decision_mode: "store_snack", avoid: profile.dislikes },
      soft_preferences: {
        goal: profile.goal,
        daily_protein_target_g: profile.protein_target_g,
        daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
        hunger: context.hunger,
        craving_type: context.craving_type,
      },
      ...(previous ? { previous_recommendations: previous } : {}),
    };
  }

  // Only equipment from the controlled vocabulary counts. "No cooking at all"
  // wins over everything else, and owning nothing means the same thing.
  const owned = profile.equipment.filter((item) =>
    (EQUIPMENT as readonly string[]).includes(item),
  );
  const appliances = owned.filter((item) => item !== NO_COOKING);
  const noCooking = owned.includes(NO_COOKING) || appliances.length === 0;

  // The explicit "Use what I have" signal, not an inference from budget.
  // It forces the budget to 0 itself, so a stale or leftover override never
  // silently permits shopping once this is chosen.
  const noShopping = context.shopping === "inventory_only";
  const overriding = !noShopping && context.budget_override_usd !== null;

  return {
    decision_mode: "cook",
    hard_constraints: {
      decision_mode: "cook",
      max_minutes: context.cook_minutes,
      budget_usd: noShopping ? 0 : (context.budget_override_usd ?? profile.budget_per_meal_usd),
      budget_source: noShopping || overriding ? "override" : "profile",
      equipment: noCooking ? [] : appliances,
      no_cooking: noCooking,
      no_shopping: noShopping,
      avoid: profile.dislikes,
    },
    soft_preferences: {
      goal: profile.goal,
      daily_protein_target_g: profile.protein_target_g,
      daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
      preferred_cuisines: profile.cuisines,
      craving: context.craving,
      ingredients_on_hand: buildAvailableIngredients(context.ingredients_on_hand, kitchenStaples),
      minimize_purchases: !noShopping && context.minimize_purchases === true,
      hunger: context.hunger,
      effort: context.effort,
      fridge_size: profile.fridge_size,
      fridge_note: FRIDGE_SIZES.find((f) => f.value === profile.fridge_size)?.hint ?? "",
    },
    ...(previous ? { previous_recommendations: previous } : {}),
  };
}

/** The canonical availability rule (see resolveRecommendationInput above):
 *  tonight's foods first, then persistent Kitchen staples — deduped
 *  case-insensitively so the same thing entered two ways doesn't show twice.
 *  No other source is ever merged in here. */
function buildAvailableIngredients(todayFoods: readonly string[], kitchenStaples: readonly string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...todayFoods, ...kitchenStaples]) {
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  return merged;
}

/** A `profiles` row, or null for a user who has never saved, as a complete
 *  ProfileInput. Anything missing or out of vocabulary falls back to defaults. */
export function toProfileInput(row: unknown): ProfileInput {
  if (!isRecord(row)) return { ...DEFAULT_PROFILE };
  return {
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    goal: pick(row.goal, GOALS.map((g) => g.value), DEFAULT_PROFILE.goal),
    protein_target_g: positive(row.protein_target_g, DEFAULT_PROFILE.protein_target_g),
    daily_calorie_target_kcal: Number.isInteger(row.daily_calorie_target_kcal) && Number(row.daily_calorie_target_kcal) > 0
      ? Number(row.daily_calorie_target_kcal)
      : null,
    // numeric(6,2) arrives from PostgREST as a string.
    budget_per_meal_usd: positive(row.budget_per_meal_usd, DEFAULT_PROFILE.budget_per_meal_usd),
    fridge_size: pick(row.fridge_size, FRIDGE_SIZES.map((f) => f.value), DEFAULT_PROFILE.fridge_size),
    default_cook_minutes: positive(row.default_cook_minutes, DEFAULT_PROFILE.default_cook_minutes),
    cuisines: strings(row.cuisines),
    dislikes: strings(row.dislikes),
    equipment: strings(row.equipment),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
