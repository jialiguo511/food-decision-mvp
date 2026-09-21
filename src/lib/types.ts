// Shared types. The LLM prompt and the UI both speak this vocabulary.

export type Goal = "fat_loss" | "muscle_gain" | "maintain" | "general_health";
export type FridgeSize = "mini" | "standard" | "large";
export type Hunger = "light" | "normal" | "very_hungry";
export type Effort = "minimal" | "some" | "happy_to_cook";

/** A row in public.profiles. */
export type Profile = {
  id: string;
  display_name: string | null;
  goal: Goal;
  protein_target_g: number;
  /** Optional, entered manually. null = no target; recommendations fall back
   *  to qualitative energy guidance. */
  daily_calorie_target_kcal: number | null;
  budget_per_meal_usd: number;
  fridge_size: FridgeSize;
  default_cook_minutes: number;
  cuisines: string[];
  dislikes: string[];
  equipment: string[];
  prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** What the profile form sends back. No id — that comes from the session. */
export type ProfileInput = Omit<
  Profile,
  "id" | "created_at" | "updated_at" | "prefs"
>;

/**
 * The first-level choice on Today: cook something, decide what to order, or
 * grab a snack/dessert from a nearby store. All three share the same profile,
 * the "exactly 3 recommendations" principle, selection, and actual-eating
 * feedback — only the dynamic context and the shape of what comes back
 * differ. See PRODUCT.md → "Two decision modes" (store_snack is the third).
 */
export type DecisionMode = "cook" | "order" | "store_snack";

/** The dynamic context captured on Today for the "I can cook" flow. */
export type MealContext = {
  decision_mode: "cook";
  cook_minutes: number;
  hunger: Hunger;
  effort: Effort;
  /** A preset from COMMON_CRAVINGS, something the user typed, or null. */
  craving: string | null;
  ingredients_on_hand: string[];
  /** null means "use the budget from my profile". */
  budget_override_usd: number | null;
};

export type OrderMethod = "delivery" | "pickup" | "eat_nearby";
/** A preset from ORDER_CRAVINGS. Coarser than the cook flow's free-text
 *  craving — see options.ts for why: ordering asks for very little effort. */
export type OrderCravingCategory =
  | "meaty"
  | "warm_comforting"
  | "fresh_light"
  | "sweet"
  | "no_preference";

/** The dynamic context captured on Today for the "I want to order food"
 *  flow. Deliberately smaller than MealContext — only what materially
 *  changes the recommendation. Goal, protein target, and dislikes come from
 *  the profile, the same as cooking. */
export type OrderContext = {
  decision_mode: "order";
  hunger: Hunger;
  craving_category: OrderCravingCategory;
  /** Optional elaboration beyond the category, e.g. "fried chicken". Craving
   *  is one of the few fields free text is allowed for — see CLAUDE.md. */
  craving_note: string | null;
  method: OrderMethod;
};

/** A preset from STORE_SNACK_CRAVINGS — see options.ts. Coarser than the cook
 *  flow's free-text craving: this mode is deliberately a single tap. */
export type CravingType = "sweet" | "salty" | "crunchy" | "creamy" | "anything";

/** The dynamic context captured on Today for the "grab a snack" flow —
 *  deliberately the smallest of the three: no store, location, or inventory
 *  data exists behind this product, so there is nothing else to ask. Goal,
 *  protein target, and dislikes come from the profile, same as the other
 *  modes. */
export type StoreSnackContext = {
  decision_mode: "store_snack";
  hunger: Hunger;
  craving_type: CravingType;
};

/** Any of Today's three dynamic contexts, discriminated on decision_mode. */
export type DecisionContext = MealContext | OrderContext | StoreSnackContext;

export type RecommendationRole = "best_match" | "lowest_effort" | "alternative";

/** One of the exactly-three recommendations for the "I can cook" flow.
 *  Every number is an estimate; costs in particular are model guesses with
 *  no grocery-price data behind them. */
export type CookRecommendation = {
  decision_mode: "cook";
  role: RecommendationRole;
  title: string;
  /** One or two user-facing sentences on why this fits tonight. */
  reason: string;
  estimated_minutes: number;
  /** Approximate value of all ingredients eaten, including ones already owned. */
  estimated_meal_cost_usd: number;
  /** Approximate money to spend tonight on missing ingredients. The budget
   *  constraint applies to this one. Can exceed meal cost (a whole bottle of
   *  soy sauce costs more than the splash the meal uses). */
  estimated_extra_cost_usd: number;
  estimated_calories: number;
  estimated_protein_g: number;
  ingredients_on_hand: string[];
  ingredients_needed: string[];
  equipment: string[];
  steps: string[];
};

/** One of the exactly-three recommendations for the "I want to order food"
 *  flow. A meal *category*, not a recipe: no steps, no ingredients, no
 *  equipment. No cost fields either — there is no real menu-price data
 *  behind them, unlike the cook flow's ingredient-cost estimates. */
export type OrderRecommendation = {
  decision_mode: "order";
  role: RecommendationRole;
  title: string;
  /** One or two user-facing sentences on why this fits right now. */
  reason: string;
  /** What to type into whatever delivery/takeout app the user already has.
   *  Plain food descriptions, never a restaurant name — no restaurant data
   *  exists behind this product. */
  search_terms: string[];
  /** The suggested order in plain language: protein, sides, extras, sauce. */
  order_notes: string;
  /** Optional, and only when it genuinely helps — one realistic tweak, never
   *  a list of prohibitions. See PRODUCT.md → "Order Food" coaching
   *  philosophy: this is harm reduction, not diet enforcement. */
  modification: string | null;
  estimated_calories: number;
  estimated_protein_g: number;
};

/** One of the exactly-three recommendations for the "grab a snack" flow — a
 *  ready-to-buy item, not a recipe or a search term for a delivery app. No
 *  cost fields: there is no real grocery-price data behind this product,
 *  same reasoning as the order flow's missing menu prices. */
export type StoreSnackRecommendation = {
  decision_mode: "store_snack";
  role: RecommendationRole;
  title: string;
  /** One or two user-facing sentences on why this fits the craving right now. */
  reason: string;
  /** Guidance for walking around a grocery/convenience/drug store — a
   *  category and rough spec ("single-serve Greek yogurt with 12–20g
   *  protein"), never an exact SKU or a claim about live inventory. */
  what_to_look_for: string;
  /** Optional second option if the first isn't found. Null when there's no
   *  natural substitute worth naming. */
  backup: string | null;
  estimated_calories: number;
  estimated_protein_g: number;
};

export type Recommendation = CookRecommendation | OrderRecommendation | StoreSnackRecommendation;

/** The constraints a cook recommendation set was generated under, echoed back
 *  so the caller can see which budget and equipment were actually applied. */
export type CookConstraints = {
  decision_mode: "cook";
  max_minutes: number;
  budget_usd: number;
  budget_source: "profile" | "override";
  equipment: string[];
  no_cooking: boolean;
  avoid: string[];
};

/** The constraints an order recommendation set was generated under. Ordering
 *  has no real time/budget/equipment limits to enforce — the only hard
 *  constraint is what the user won't eat. */
export type OrderConstraints = {
  decision_mode: "order";
  avoid: string[];
};

/** The constraints a store-snack recommendation set was generated under. Like
 *  ordering, there is no time/budget/equipment limit to enforce — only what
 *  the user won't eat. */
export type StoreSnackConstraints = {
  decision_mode: "store_snack";
  avoid: string[];
};

export type ActiveConstraints = CookConstraints | OrderConstraints | StoreSnackConstraints;

/** Body of a successful POST /api/recommend. The tuple type is the "exactly
 *  three" rule expressed where TypeScript can enforce it. */
export type RecommendSuccess = {
  recommendations: [Recommendation, Recommendation, Recommendation];
  nutrition_is_estimate: true;
  constraints: ActiveConstraints;
  model: string;
  /** The decision_sessions row this set was stored under. Selecting a
   *  recommendation writes chosen_index back onto this same row. */
  session_id: string;
};

export type RecommendErrorCode =
  | "llm_not_configured"
  | "unauthenticated"
  | "invalid_context"
  | "profile_unavailable"
  | "malformed_output"
  | "constraint_violation"
  | "model_refused"
  | "truncated_output"
  | "rate_limited"
  | "upstream_timeout"
  | "upstream_error"
  | "session_save_failed";

export type RecommendFailure = {
  error: { code: RecommendErrorCode; message: string; details?: string[] };
};

/** The part of a decision_sessions row Today needs to resume the flow: which
 *  context produced which three recommendations, and where to write
 *  chosen_index. Deliberately excludes chosen_index itself — that maps to UI
 *  selection state, not the identity of the recommendation set — and excludes
 *  model/constraints, which are not persisted on the row. Used both for a
 *  freshly generated set and for one restored from the database. Works for
 *  either decision mode; context and recommendations always agree on mode. */
export type ActiveSession = {
  session_id: string;
  context: DecisionContext;
  recommendations: [Recommendation, Recommendation, Recommendation];
};
