// Turns what we know about the user into the context object the recommender
// sees. Hard constraints and soft preferences are kept in separate sections on
// purpose: the prompt treats the first as non-negotiable and the second as
// ranking signals, and mixing them is how a craving ends up overriding a
// dislike.
//
// Both decision modes (cook / order) go through this file, discriminated on
// `decision_mode` throughout — see types.ts.

import { z } from "zod";
import { DEFAULT_PROFILE, EQUIPMENT, FRIDGE_SIZES, GOALS, ORDER_CRAVINGS, ORDER_METHODS } from "../options";
import type {
  ActiveConstraints,
  DecisionContext,
  Effort,
  FridgeSize,
  Goal,
  Hunger,
  MealContext,
  OrderContext,
  OrderCravingCategory,
  OrderMethod,
  ProfileInput,
  Recommendation,
  RecommendationRole,
} from "../types";
import { storedRecommendationsSchema } from "./output";

const NO_COOKING = "No cooking at all";

/** The dynamic context for "I can cook", as sent from Today. It comes from
 *  the browser, so nothing in it is trusted until it passes this schema. */
export const cookContextSchema = z.object({
  decision_mode: z.literal("cook"),
  cook_minutes: z.number().int().min(5).max(180),
  hunger: z.enum(["light", "normal", "very_hungry"]),
  effort: z.enum(["minimal", "some", "happy_to_cook"]),
  craving: z
    .string()
    .max(200)
    .nullable()
    .transform((value) => value?.trim().replace(/\s+/g, " ") || null),
  ingredients_on_hand: z.array(z.string().trim().min(1).max(60)).max(40),
  budget_override_usd: z.number().min(1).max(100).nullable(),
}) satisfies z.ZodType<MealContext>;

const orderCravingCategories = ORDER_CRAVINGS.map((c) => c.value) as [OrderCravingCategory, ...OrderCravingCategory[]];
const orderMethods = ORDER_METHODS.map((m) => m.value) as [OrderMethod, ...OrderMethod[]];

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
}) satisfies z.ZodType<OrderContext>;

/** Either half of Today's dynamic context. */
export const contextSchema = z.discriminatedUnion("decision_mode", [cookContextSchema, orderContextSchema]);

/** The full POST /api/recommend body. `previous_recommendations` is only ever
 *  sent by "Show me 3 more" — the exact set the user is asking to move away
 *  from, so the model can avoid near-duplicates instead of minor variations.
 *  It reuses storedRecommendationsSchema rather than a parallel shape: it's
 *  the same "three recommendations already in decision_sessions" data,
 *  round-tripped from the client instead of read back from the database. */
export const recommendRequestSchema = z.object({
  context: contextSchema,
  previous_recommendations: storedRecommendationsSchema.optional(),
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
  };
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
};

export type RecommendationInput = CookRecommendationInput | OrderRecommendationInput;

export function resolveRecommendationInput(
  profile: ProfileInput,
  context: DecisionContext,
  previousRecommendations?: readonly Recommendation[],
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

  const overriding = context.budget_override_usd !== null;

  return {
    decision_mode: "cook",
    hard_constraints: {
      decision_mode: "cook",
      max_minutes: context.cook_minutes,
      budget_usd: context.budget_override_usd ?? profile.budget_per_meal_usd,
      budget_source: overriding ? "override" : "profile",
      equipment: noCooking ? [] : appliances,
      no_cooking: noCooking,
      avoid: profile.dislikes,
    },
    soft_preferences: {
      goal: profile.goal,
      daily_protein_target_g: profile.protein_target_g,
      daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
      preferred_cuisines: profile.cuisines,
      craving: context.craving,
      ingredients_on_hand: context.ingredients_on_hand,
      hunger: context.hunger,
      effort: context.effort,
      fridge_size: profile.fridge_size,
      fridge_note: FRIDGE_SIZES.find((f) => f.value === profile.fridge_size)?.hint ?? "",
    },
    ...(previous ? { previous_recommendations: previous } : {}),
  };
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
