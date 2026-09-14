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

/** The dynamic context captured on Today. */
export type MealContext = {
  cook_minutes: number;
  hunger: Hunger;
  effort: Effort;
  /** A preset from COMMON_CRAVINGS, something the user typed, or null. */
  craving: string | null;
  ingredients_on_hand: string[];
  /** null means "use the budget from my profile". */
  budget_override_usd: number | null;
};

export type RecommendationRole = "best_match" | "lowest_effort" | "alternative";

/** One of the exactly-three recommendations.
 *  Used by the recommendation and results flows. Every number is an estimate;
 *  costs in particular are model guesses with no grocery-price data behind them. */
export type Recommendation = {
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

/** The constraints a recommendation set was generated under, echoed back so
 *  the caller can see which budget and equipment were actually applied. */
export type ActiveConstraints = {
  max_minutes: number;
  budget_usd: number;
  budget_source: "profile" | "override";
  equipment: string[];
  no_cooking: boolean;
  avoid: string[];
};

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
 *  freshly generated set and for one restored from the database. */
export type ActiveSession = {
  session_id: string;
  context: MealContext;
  recommendations: [Recommendation, Recommendation, Recommendation];
};
