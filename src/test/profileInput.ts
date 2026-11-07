// A fully-specified recommender profile for tests that aren't about provenance:
// every value is explicit and stated here, so a test's expectation never
// depends on a system fallback. (Production has no such default — a new user's
// profile is `DEFAULT_FORM_VALUES`, with nothing set.)

import type { ProfileInput } from "@/lib/types";

export const DEFAULT_PROFILE: ProfileInput = {
  display_name: null,
  goal: "general_health",
  protein_target_g: 120,
  daily_calorie_target_kcal: null,
  budget_per_meal_usd: 12,
  fridge_size: "standard",
  default_cook_minutes: 30,
  cuisines: [],
  dislikes: [],
  allergies: [],
  nutrition_priorities: [],
  equipment: ["Stovetop", "Microwave"],
  dietary_patterns: [],
  dietary_other: null,
};
