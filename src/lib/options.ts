// The controlled vocabulary of the product.
//
// The UI renders chips from these lists AND the LLM prompt is built from the
// same lists. Keeping one source of truth is what stops the model from being
// asked about an "air fryer" the UI never offered.

import type { Effort, FridgeSize, Goal, Hunger } from "./types";

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
export const BUDGET_PER_MEAL = { min: 3, max: 40, step: 1 };
export const COOK_MINUTES = [10, 20, 30, 45, 60] as const;

/** Used when a user has no profile row yet. Every field has a real default
 *  so someone can land on Today and press the button immediately. */
export const DEFAULT_PROFILE = {
  display_name: null,
  goal: "general_health" as Goal,
  protein_target_g: 120,
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
