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

/** One of the exactly-three recommendations.
 *  Used by the recommendation and results flows. */
export type Recommendation = {
  title: string;
  category: "best_match" | "lowest_effort" | "alternative";
  reason: string;
  estimated_minutes: number;
  estimated_cost_usd: number;
  approx_calories: number;
  approx_protein_g: number;
  ingredients_have: string[];
  ingredients_needed: string[];
  equipment: string[];
  steps: string[];
};
