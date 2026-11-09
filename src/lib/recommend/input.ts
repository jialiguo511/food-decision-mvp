// Turns what we know about the user into the context object the recommender
// sees. Hard constraints and soft preferences are kept in separate sections on
// purpose: the prompt treats the first as non-negotiable and the second as
// ranking signals, and mixing them is how a craving ends up overriding a
// dislike.
//
// Both decision modes (cook / order) go through this file, discriminated on
// `decision_mode` throughout — see types.ts.

import { z } from "zod";
import { EQUIPMENT, FRIDGE_SIZES, MEAL_BUDGETS, SYSTEM_FALLBACKS, ORDER_CRAVINGS, ORDER_METHODS, STORE_SNACK_CRAVINGS, TRAVEL_OPTIONS } from "../options";
import type {
  ActiveConstraints,
  CravingType,
  DietaryConstraint,
  DecisionContext,
  Effort,
  FridgeSize,
  Goal,
  Hunger,
  MealBudget,
  MealContext,
  OpenContext,
  OrderContext,
  OrderCravingCategory,
  OrderMethod,
  NutritionPriority,
  ProfileInput,
  Recommendation,
  RecommendationRole,
  StoreSnackContext,
  TravelWillingness,
} from "../types";
import type { PlaceCandidate } from "../places/candidates";
import { effectiveTravel } from "../places/travel";
import { budgetFit, type BudgetFit } from "./budget";
import type { BehaviorHints } from "./behavior";
import { assessFeasibility, type FeasibilityTier } from "./feasibility";
import { storedRecommendationsSchema } from "./output";

const NO_COOKING = "No cooking at all";

/** The hard dietary constraint, from the Profile — in every mode. */
function dietaryOf(profile: ProfileInput): DietaryConstraint {
  return { patterns: profile.dietary_patterns, other: profile.dietary_other };
}

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
const travelChoices = TRAVEL_OPTIONS.map((t) => t.value) as [TravelWillingness, ...TravelWillingness[]];

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
  // How far the user would go for Eat nearby. Same backward-compat rule as
  // meal_budget: missing means "no strong preference".
  travel_willingness: z
    .enum(travelChoices)
    .optional()
    .transform((value): TravelWillingness => value ?? "no_preference"),
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

const phraseOrNull = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform((value) => value?.trim().replace(/\s+/g, " ") || null);

/** The cross-way context a typed sentence can build ("I can buy things or make
 *  something"). Every limit is nullable: not stated = not enforced. The cook/buy
 *  pair can't both be false — there would be nothing to recommend. */
export const openContextSchema = z
  .object({
    decision_mode: z.literal("open"),
    hunger: z.enum(["light", "normal", "very_hungry"]),
    ways: z.object({ cook: z.boolean(), buy: z.boolean() }).refine((w) => w.cook || w.buy, "at least one way must be allowed"),
    minutes: z.number().int().min(5).max(180).nullable(),
    effort: z.enum(["minimal", "some", "happy_to_cook"]).nullable(),
    extra_spend_usd: z.number().min(0).max(100).nullable(),
    meal_budget: z.enum(mealBudgets),
    ingredients_on_hand: z.array(z.string().trim().min(1).max(60)).max(40),
    craving: phraseOrNull(200),
    after_exercise: z.boolean(),
    protein_focus: z.boolean(),
    easy_pick: z.boolean(),
    // Older stored sessions and pages have no such field: not asked for.
    meal_only: z.boolean().default(false),
  }) satisfies z.ZodType<OpenContext, unknown>;

/** Any of Today's dynamic contexts. */
export const contextSchema = z.discriminatedUnion("decision_mode", [
  cookContextSchema,
  orderContextSchema,
  storeSnackContextSchema,
  openContextSchema,
]);

/** The full POST /api/recommend body. `previous_recommendations` is only ever
 *  sent by "Show me 3 more" — the exact set the user is asking to move away
 *  from, so the model can avoid near-duplicates instead of minor variations.
 *  It reuses storedRecommendationsSchema rather than a parallel shape: it's
 *  the same "three recommendations already in decision_sessions" data,
 *  round-tripped from the client instead of read back from the database. */
export const recommendRequestSchema = z.object({
  context: contextSchema,
  // How this decision started, for the product events only — never read by the
  // recommender. Optional so an older page still works.
  entry: z.enum(["sentence", "steps", "again", "more", "adjust"]).optional(),
  // Nearby "Show me 3 more" only: every place already shown in this decision.
  // Lenient on purpose — it can only EXCLUDE places, so anything that isn't a
  // short string is dropped rather than failing the request.
  shown_place_ids: z
    .array(z.unknown())
    .max(60)
    .optional()
    .catch(undefined)
    .transform((items) => items?.filter((i): i is string => typeof i === "string" && i.length > 0 && i.length <= 300)),
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
    /** Profile "disliked foods": a very strong negative signal, NOT an allergy
     *  or restriction. Allergies are in hard_constraints. */
    disliked_foods: string[];
    craving: string | null;
    ingredients_on_hand: string[];
    /** True only for the "Show me what to buy" fallback — see
     *  MealContext.minimize_purchases. Always false when no_shopping. */
    minimize_purchases: boolean;
    hunger: Hunger;
    effort: Effort;
    /** null when the user hasn't said — nothing is assumed about the fridge. */
    fridge_size: FridgeSize | null;
    fridge_note: string;
  };
  /** Present only for "Show me 3 more". Trimmed to what matters for telling
   *  the model what to avoid — no numbers, so it can't be mistaken for
   *  another constraint. */
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
  /** The user's CONFIRMED nutrition priorities — strong guidance, not a hard
   *  constraint. Absent when none are set, so such a user's request is exactly
   *  what it was before they existed. Health conditions are never sent. */
  nutrition_priorities?: NutritionPriority[];
  /** Lowest-priority, optional: a tiny summary of what the user has recently
   *  chosen in this mode. Absent for a new user or sparse history. Soft
   *  context only — see behavior.ts and the prompt's "Behavioral hints". */
  behavioral_hints?: BehaviorHints;
};

export type OrderRecommendationInput = {
  decision_mode: "order";
  hard_constraints: Extract<ActiveConstraints, { decision_mode: "order" }>;
  soft_preferences: SoftGoalPreferences & {
    preferred_cuisines: string[];
    disliked_foods: string[];
    hunger: Hunger;
    craving_category: OrderCravingCategory;
    craving_note: string | null;
    method: OrderMethod;
    /** Approximate total budget for this meal — a feasibility ranking signal,
     *  not a price the model may quote. See MealBudget. */
    meal_budget: MealBudget;
  };
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
  /** The user's CONFIRMED nutrition priorities — strong guidance, not a hard
   *  constraint. Absent when none are set, so such a user's request is exactly
   *  what it was before they existed. Health conditions are never sent. */
  nutrition_priorities?: NutritionPriority[];
  /** Lowest-priority, optional: a tiny summary of what the user has recently
   *  chosen in this mode. Absent for a new user or sparse history. Soft
   *  context only — see behavior.ts and the prompt's "Behavioral hints". */
  behavioral_hints?: BehaviorHints;
};

export type StoreSnackRecommendationInput = {
  decision_mode: "store_snack";
  hard_constraints: Extract<ActiveConstraints, { decision_mode: "store_snack" }>;
  soft_preferences: SoftGoalPreferences & {
    disliked_foods: string[];
    hunger: Hunger;
    craving_type: CravingType;
  };
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
  /** The user's CONFIRMED nutrition priorities — strong guidance, not a hard
   *  constraint. Absent when none are set, so such a user's request is exactly
   *  what it was before they existed. Health conditions are never sent. */
  nutrition_priorities?: NutritionPriority[];
  /** Lowest-priority, optional: a tiny summary of what the user has recently
   *  chosen in this mode. Absent for a new user or sparse history. Soft
   *  context only — see behavior.ts and the prompt's "Behavioral hints". */
  behavioral_hints?: BehaviorHints;
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
  /** Deterministic feasibility (open now, distance vs. how far the user would
   *  go, price level vs. meal budget), computed before the model — the model
   *  may outweigh it with a much better craving fit, never ignore "weak". */
  feasibility: FeasibilityTier;
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
    /** How far the user would go. Already reflected in the search radius and
     *  in each candidate's `feasibility`; passed so the model reads
     *  `distance_m` the way the user meant it. Always "no_preference" unless
     *  the method is eat_nearby or pickup. */
    travel_willingness: TravelWillingness;
  };
  /** The ONLY places that may be recommended — this request's provider
   *  results, after filtering. */
  candidates: ModelCandidate[];
  /** The user's CONFIRMED nutrition priorities — strong guidance, not a hard
   *  constraint. Absent when none are set, so such a user's request is exactly
   *  what it was before they existed. Health conditions are never sent. */
  nutrition_priorities?: NutritionPriority[];
  /** Lowest-priority, optional: a tiny summary of what the user has recently
   *  chosen in this mode. Absent for a new user or sparse history. Soft
   *  context only — see behavior.ts and the prompt's "Behavioral hints". */
  behavioral_hints?: BehaviorHints;
};

/** One request whose answer may mix ways of eating (Cook / Get food / Snack
 *  cards), under ONE model call — see OpenContext. */
export type OpenRecommendationInput = {
  decision_mode: "open";
  hard_constraints: Extract<ActiveConstraints, { decision_mode: "open" }>;
  soft_preferences: SoftGoalPreferences & {
    preferred_cuisines: string[];
    disliked_foods: string[];
    hunger: Hunger;
    effort: Effort | null;
    craving: string | null;
    /** ONLY what the person named plus their persistent Kitchen staples. Not a
     *  statement that nothing else exists — nothing else is KNOWN. */
    ingredients_on_hand: string[];
    /** Rough budget for a bought meal ("no_preference" when not said). */
    meal_budget: MealBudget;
    easy_pick: boolean;
    /** Their own words about the situation — context, never a measurement. */
    situation: { after_exercise: boolean; wants_more_protein: boolean };
  };
  previous_recommendations?: { role: RecommendationRole; title: string; reason: string }[];
  nutrition_priorities?: NutritionPriority[];
};

export type RecommendationInput =
  | CookRecommendationInput
  | OrderRecommendationInput
  | StoreSnackRecommendationInput
  | NearbyRecommendationInput
  | OpenRecommendationInput;

/** The nearby counterpart of resolveRecommendationInput: same profile, same
 *  order-flow context, plus the real candidates the provider returned. Kept
 *  separate so the profile → soft-preferences mapping is the only thing shared
 *  with future personalization, not the Places plumbing. */
export function resolveNearbyInput(
  profile: ProfileInput,
  context: OrderContext,
  candidates: readonly PlaceCandidate[],
  behavioralHints?: BehaviorHints | null,
): NearbyRecommendationInput {
  const travel = effectiveTravel(context);
  return {
    decision_mode: "nearby",
    // Allergies are the hard constraint; dislikes stay soft — see
    // NearbyConstraints.
    hard_constraints: { decision_mode: "nearby", allergies: profile.allergies, dietary: dietaryOf(profile) },
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
      travel_willingness: travel,
    },
    candidates: candidates.map((c) => ({
      place_id: c.id,
      name: c.name,
      category: c.category,
      distance_m: c.distance_m,
      open_now: c.open_now === true ? true : null,
      price_level: c.price_level,
      feasibility: assessFeasibility(c, { meal_budget: context.meal_budget, travel }).tier,
      budget_fit: budgetFit(context.meal_budget, c.price_level),
    })),
    ...(profile.nutrition_priorities.length > 0 ? { nutrition_priorities: profile.nutrition_priorities } : {}),
    ...(behavioralHints ? { behavioral_hints: behavioralHints } : {}),
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
  /** Optional, lowest-priority summary of recent choices — see behavior.ts. */
  behavioralHints?: BehaviorHints | null,
): RecommendationInput {
  const previous =
    previousRecommendations && previousRecommendations.length > 0
      ? previousRecommendations.map((r) => ({ role: r.role, title: r.title, reason: r.reason }))
      : undefined;
  const hints = {
    ...(profile.nutrition_priorities.length > 0 ? { nutrition_priorities: profile.nutrition_priorities } : {}),
    ...(behavioralHints ? { behavioral_hints: behavioralHints } : {}),
  };

  if (context.decision_mode === "open") {
    // Equipment is the same hard constraint it is everywhere: only what the user said
    // they can cook with counts, and unknown behaves as "no appliance". Time and the
    // purchase ceiling are the person's own words from THIS sentence, else null —
    // a Profile default or a system number is never turned into a limit they set.
    const owned = (profile.equipment ?? []).filter((item) => (EQUIPMENT as readonly string[]).includes(item));
    const equipmentKnown = owned.length > 0;
    const appliances = owned.filter((item) => item !== NO_COOKING);
    const noCooking = !equipmentKnown || owned.includes(NO_COOKING) || appliances.length === 0;
    return {
      decision_mode: "open",
      hard_constraints: {
        decision_mode: "open",
        ways: context.ways,
        meal_only: context.meal_only,
        allergies: profile.allergies,
        dietary: dietaryOf(profile),
        cook: context.ways.cook
          ? {
              max_minutes: context.minutes,
              budget_usd: context.extra_spend_usd ?? profile.budget_per_meal_usd ?? null,
              equipment: noCooking ? [] : appliances,
              equipment_known: equipmentKnown,
              no_cooking: noCooking,
            }
          : null,
      },
      soft_preferences: {
        goal: profile.goal,
        daily_protein_target_g: profile.protein_target_g,
        daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
        preferred_cuisines: profile.cuisines,
        disliked_foods: profile.dislikes,
        hunger: context.hunger,
        effort: context.effort,
        craving: context.craving,
        ingredients_on_hand: buildAvailableIngredients(context.ingredients_on_hand, context.ways.cook ? kitchenStaples : []),
        meal_budget: context.meal_budget,
        easy_pick: context.easy_pick,
        situation: { after_exercise: context.after_exercise, wants_more_protein: context.protein_focus },
      },
      ...(previous ? { previous_recommendations: previous } : {}),
      ...(profile.nutrition_priorities.length > 0 ? { nutrition_priorities: profile.nutrition_priorities } : {}),
    };
  }

  if (context.decision_mode === "order") {
    return {
      decision_mode: "order",
      hard_constraints: { decision_mode: "order", allergies: profile.allergies, dietary: dietaryOf(profile) },
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
      ...(previous ? { previous_recommendations: previous } : {}),
      ...hints,
    };
  }

  if (context.decision_mode === "store_snack") {
    return {
      decision_mode: "store_snack",
      hard_constraints: { decision_mode: "store_snack", allergies: profile.allergies, dietary: dietaryOf(profile) },
      soft_preferences: {
        goal: profile.goal,
        daily_protein_target_g: profile.protein_target_g,
        daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
        disliked_foods: profile.dislikes,
        hunger: context.hunger,
        craving_type: context.craving_type,
      },
      ...(previous ? { previous_recommendations: previous } : {}),
      ...hints,
    };
  }

  // Only equipment from the controlled vocabulary counts. "No cooking at all"
  // wins over everything else. Equipment the user never told us about is NOT
  // assumed: unknown behaves like "no appliance at all" until they answer
  // (the app asks before a first Cook request), so a recipe can never lean on a
  // microwave or oven nobody said exists.
  const owned = (profile.equipment ?? []).filter((item) => (EQUIPMENT as readonly string[]).includes(item));
  const equipmentKnown = owned.length > 0;
  const appliances = owned.filter((item) => item !== NO_COOKING);
  const noCooking = !equipmentKnown || owned.includes(NO_COOKING) || appliances.length === 0;

  // The explicit "Use what I have" signal, not an inference from budget.
  // It forces the budget to 0 itself, so a stale or leftover override never
  // silently permits shopping once this is chosen.
  const noShopping = context.shopping === "inventory_only";
  const overriding = !noShopping && context.budget_override_usd !== null;
  // The ceiling: tonight's choice, else a budget the user set in Me, else the
  // system's internal fallback — which is never shown to them as theirs.
  const budgetUsd = noShopping
    ? 0
    : (context.budget_override_usd ?? profile.budget_per_meal_usd ?? SYSTEM_FALLBACKS.extras_budget_usd);
  const budgetSource =
    noShopping || overriding ? "override" : profile.budget_per_meal_usd !== null ? "profile" : "default";

  return {
    decision_mode: "cook",
    hard_constraints: {
      decision_mode: "cook",
      max_minutes: context.cook_minutes,
      budget_usd: budgetUsd,
      budget_source: budgetSource,
      equipment: noCooking ? [] : appliances,
      equipment_known: equipmentKnown,
      no_cooking: noCooking,
      no_shopping: noShopping,
      allergies: profile.allergies,
      dietary: dietaryOf(profile),
    },
    soft_preferences: {
      goal: profile.goal,
      daily_protein_target_g: profile.protein_target_g,
      daily_calorie_target_kcal: profile.daily_calorie_target_kcal,
      preferred_cuisines: profile.cuisines,
      disliked_foods: profile.dislikes,
      craving: context.craving,
      ingredients_on_hand: buildAvailableIngredients(context.ingredients_on_hand, kitchenStaples),
      minimize_purchases: !noShopping && context.minimize_purchases === true,
      hunger: context.hunger,
      effort: context.effort,
      fridge_size: profile.fridge_size,
      fridge_note: FRIDGE_SIZES.find((f) => f.value === profile.fridge_size)?.hint ?? "",
    },
    ...(previous ? { previous_recommendations: previous } : {}),
    ...hints,
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

export { toProfileInput } from "../profile";
