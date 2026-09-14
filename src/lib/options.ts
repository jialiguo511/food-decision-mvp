// The controlled vocabulary of the product.
//
// The UI renders chips from these lists AND the LLM prompt is built from the
// same lists. Keeping one source of truth is what stops the model from being
// asked about an "air fryer" the UI never offered.

import type { DecisionMode, Effort, FridgeSize, Goal, Hunger, OrderCravingCategory, OrderMethod } from "./types";

export const GOALS: { value: Goal; label: string; hint: string }[] = [
  { value: "fat_loss", label: "Fat loss", hint: "Lower calories, high protein" },
  { value: "muscle_gain", label: "Build muscle", hint: "Protein first, calories welcome" },
  { value: "maintain", label: "Maintain", hint: "Keep things steady" },
  { value: "general_health", label: "Eat better", hint: "No strict numbers" },
];

export const FRIDGE_SIZES: { value: FridgeSize; label: string; hint: string }[] = [
  { value: "mini", label: "Mini", hint: "Dorm / studio — buy for 1–2 days" },
  { value: "standard", label: "Standard", hint: "Normal apartment fridge" },
  { value: "large", label: "Large", hint: "Room to batch cook" },
];

export const CUISINES = [
  "Chinese",
  "Japanese",
  "Korean",
  "Thai",
  "Vietnamese",
  "Indian",
  "Mediterranean",
  "Middle Eastern",
  "Mexican",
  "Italian",
  "American",
  "Comfort food",
] as const;

export const EQUIPMENT = [
  "Stovetop",
  "Oven",
  "Microwave",
  "Air fryer",
  "Rice cooker",
  "Blender",
  "Instant Pot",
  "Toaster oven",
  "Grill",
  "No cooking at all",
] as const;

/** Starting points so the user can tap a chip instead of typing. */
export const COMMON_DISLIKES = [
  "Cilantro",
  "Mushrooms",
  "Olives",
  "Blue cheese",
  "Shellfish",
  "Very spicy",
  "Raw fish",
  "Liver / organ meat",
] as const;

export const PROTEIN_TARGET = { min: 60, max: 220, step: 5 };
/** Accepted range for the optional daily calorie target. Matches the database
 *  check constraint in supabase/schema.sql. */
export const CALORIE_TARGET = { min: 1000, max: 5000 };
export const BUDGET_PER_MEAL = { min: 3, max: 40, step: 1 };
export const COOK_MINUTES = [10, 20, 30, 45, 60] as const;

/** Used when a user has no profile row yet. Every field has a real default
 *  so someone can land on Today and press the button immediately. */
export const DEFAULT_PROFILE = {
  display_name: null,
  goal: "general_health" as Goal,
  protein_target_g: 120,
  daily_calorie_target_kcal: null as number | null,
  budget_per_meal_usd: 12,
  fridge_size: "standard" as FridgeSize,
  default_cook_minutes: 30,
  cuisines: [] as string[],
  dislikes: [] as string[],
  equipment: ["Stovetop", "Microwave"] as string[],
};

// ---------------------------------------------------------------------------
// Today — the dynamic half of the context. Same rule as above: the chips the
// user taps and the words the prompt uses come from these lists.
// ---------------------------------------------------------------------------

export const HUNGER_LEVELS: { value: Hunger; label: string; hint: string }[] = [
  { value: "light", label: "Barely", hint: "Something small" },
  { value: "normal", label: "Normal", hint: "A regular meal" },
  { value: "very_hungry", label: "Starving", hint: "Feed me properly" },
];

export const EFFORT_LEVELS: { value: Effort; label: string; hint: string }[] = [
  { value: "minimal", label: "None", hint: "Assemble, barely cook" },
  { value: "some", label: "A little", hint: "One pan is fine" },
  { value: "happy_to_cook", label: "I want to cook", hint: "Cooking sounds good" },
];

/** Craving presets. The user can also type their own — see TodayForm. */
export const COMMON_CRAVINGS = [
  "Something warm",
  "Something fresh",
  "Spicy",
  "Comfort food",
  "Light and clean",
  "High protein",
  "Carbs",
  "Soup",
] as const;

// ---------------------------------------------------------------------------
// Decision mode — the first choice on Today. See PRODUCT.md → "Two decision
// modes".
// ---------------------------------------------------------------------------

export const DECISION_MODES: { value: DecisionMode; label: string; hint: string }[] = [
  { value: "cook", label: "I can cook", hint: "Get a recipe" },
  { value: "order", label: "I want to order food", hint: "Get what to search for" },
];

// ---------------------------------------------------------------------------
// Order Food — the lightweight alternative to cooking. Asks only what
// materially changes the recommendation; everything else (goal, protein
// target, dislikes) is reused from the profile. See PRODUCT.md → "Order
// Food" for the coaching philosophy behind these categories.
// ---------------------------------------------------------------------------

export const ORDER_CRAVINGS: { value: OrderCravingCategory; label: string }[] = [
  { value: "meaty", label: "Meaty / high protein" },
  { value: "warm_comforting", label: "Warm & comforting" },
  { value: "fresh_light", label: "Fresh / light" },
  { value: "sweet", label: "Something sweet" },
  { value: "no_preference", label: "No strong preference" },
];

export const ORDER_METHODS: { value: OrderMethod; label: string }[] = [
  { value: "delivery", label: "Delivery" },
  { value: "pickup", label: "Pickup / takeout" },
  { value: "eat_nearby", label: "Eat nearby" },
];

/** The staples worth a one-tap chip. Anything else is typed. */
export const QUICK_INGREDIENTS = [
  "Eggs",
  "Chicken",
  "Ground beef",
  "Tofu",
  "Salmon",
  "Rice",
  "Pasta",
  "Bread",
  "Potatoes",
  "Beans",
  "Frozen veg",
  "Spinach",
  "Onion",
  "Garlic",
  "Cheese",
  "Yogurt",
] as const;

// ---------------------------------------------------------------------------
// Meal feedback — the core loop's final step. Stored in meal_feedback.note,
// so these values are also what's written to the database, not just labels.
// ---------------------------------------------------------------------------

/** Optional reason when the user didn't eat the meal they chose. */
export const REJECTION_REASONS: { value: string; label: string }[] = [
  { value: "changed_my_mind", label: "Changed my mind" },
  { value: "too_much_effort", label: "Too much effort" },
  { value: "ingredients_unavailable", label: "Ingredients unavailable" },
  { value: "ate_something_else", label: "Ate something else" },
  { value: "not_appealing", label: "Not appealing" },
  { value: "other", label: "Other" },
];

/** Optional follow-up when the user did eat the meal they chose. */
export const WOULD_EAT_AGAIN: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];
