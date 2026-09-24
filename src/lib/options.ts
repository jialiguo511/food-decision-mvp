// The controlled vocabulary of the product.
//
// The UI renders chips from these lists AND the LLM prompt is built from the
// same lists. Keeping one source of truth is what stops the model from being
// asked about an "air fryer" the UI never offered.

import type { CookShopping, CravingType, DecisionMode, Effort, FridgeSize, Goal, Hunger, OrderCravingCategory, OrderMethod } from "./types";

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
/** min: 0 is a real, meaningful value — "no additional spending", not just a
 *  slider floor. Budget is a ceiling on additional spend, never an amount a
 *  meal is expected to use. */
export const BUDGET_PER_MEAL = { min: 0, max: 40, step: 1 };
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

/** Whether tonight allows any shopping at all. Explicit and separate from the
 *  budget slider on purpose — see types.ts → CookShopping. */
export const COOK_SHOPPING_MODES: { value: CookShopping; label: string; hint: string }[] = [
  { value: "inventory_only", label: "Use what I have", hint: "No shopping tonight" },
  { value: "can_buy", label: "I can buy a few things", hint: "Set a budget below" },
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
  { value: "store_snack", label: "I want a snack", hint: "Get something to grab nearby" },
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
// Cook and order modes use different vocabularies here — see MealFeedback.tsx
// — because "ingredients unavailable" or "too much effort" don't describe why
// an order didn't happen, and vice versa.
// ---------------------------------------------------------------------------

/** Optional reason when the user didn't cook/eat the meal they chose. */
export const COOK_REJECTION_REASONS: { value: string; label: string }[] = [
  { value: "changed_my_mind", label: "Changed my mind" },
  { value: "too_much_effort", label: "Too much effort" },
  { value: "ingredients_unavailable", label: "Ingredients unavailable" },
  { value: "ate_something_else", label: "Ate something else" },
  { value: "not_appealing", label: "Not appealing" },
  { value: "other", label: "Other" },
];

/** Optional follow-up when the user did cook/eat the meal they chose. */
export const WOULD_EAT_AGAIN: { value: string; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "No" },
];

/** Order mode's first post-selection question. Choosing a card only means
 *  "planning to order this" — not that the user has eaten, or even ordered,
 *  anything yet. This is where that gets resolved. */
export const ORDER_OUTCOMES: { value: string; label: string }[] = [
  { value: "ordered_it", label: "I ordered it" },
  { value: "ordered_similar", label: "I ordered something similar" },
  { value: "didnt_order", label: "Didn't end up ordering it" },
];

/** Optional follow-up reason when the order didn't happen. */
export const ORDER_REJECTION_REASONS: { value: string; label: string }[] = [
  { value: "couldnt_find_it", label: "Couldn't find it" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "delivery_too_slow", label: "Delivery too slow" },
  { value: "didnt_sound_good", label: "Didn't sound good anymore" },
  { value: "changed_my_mind", label: "Changed my mind" },
  { value: "ordered_something_else", label: "Ordered something else" },
  { value: "too_much_food", label: "Too heavy / too much food" },
  { value: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// Grab a snack — the third decision mode. Deliberately the lightest of the
// three: a single craving chip, no store/location/inventory data. See
// PRODUCT.md → "Two decision modes" (this is the third) and prompt.ts for the
// craving-satisfaction philosophy behind it.
// ---------------------------------------------------------------------------

export const STORE_SNACK_CRAVINGS: { value: CravingType; label: string }[] = [
  { value: "sweet", label: "Sweet" },
  { value: "salty", label: "Salty" },
  { value: "crunchy", label: "Crunchy" },
  { value: "creamy", label: "Creamy" },
  { value: "anything", label: "Anything" },
];

/** Optional reason when the user didn't end up eating the snack they chose.
 *  Reuses ORDER_REJECTION_REASONS' value strings where the meaning is
 *  identical ("couldnt_find_it", "too_expensive", "changed_my_mind",
 *  "too_much_food") rather than inventing parallel vocabulary for the same
 *  outcomes. */
export const STORE_SNACK_REJECTION_REASONS: { value: string; label: string }[] = [
  { value: "not_what_i_wanted", label: "Not what I wanted" },
  { value: "couldnt_find_it", label: "Couldn't find it" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_filling_enough", label: "Not filling enough" },
  { value: "too_much_food", label: "Too much food" },
  { value: "changed_my_mind", label: "Changed my mind" },
];
