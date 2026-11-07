// The identity of a generated recipe image: "generate once, reuse". Two
// recipes get the same key when they would obviously be the same picture —
// same dish, same main ingredients, same way of cooking it — however the model
// happened to word the title or order the ingredients; and different dishes
// never share one. A key is a sha256 hex string, so it is also safe to use as
// a storage file name and cannot be guessed from, or confused with, user input.
//
// Deliberately NOT in the key: the reason text, the estimates, the cost, the
// minutes, the role — they vary between generations of the same dish and have
// no effect on what it looks like. Bump IMAGE_PROMPT_VERSION to start over
// (every key changes) when the prompt or look is changed on purpose.

import { createHash } from "node:crypto";

export const IMAGE_PROMPT_VERSION = 1;

/** Words that add nothing to what a dish looks like. */
const TITLE_NOISE = new Set(["easy", "quick", "simple", "healthy", "best", "homemade", "ultimate", "classic", "style", "with", "and", "a", "the", "my", "your", "tonight", "weeknight"]);

/** Seasonings and basics: in almost every recipe, so they say nothing about
 *  which dish it is (and "olive oil" vs "oil" shouldn't split the cache). */
const PANTRY_BASICS = new Set(["salt", "pepper", "black pepper", "oil", "olive oil", "cooking oil", "vegetable oil", "sesame oil", "water", "sugar", "butter", "soy sauce", "vinegar", "garlic powder", "onion powder", "paprika", "cumin", "chili flakes", "hot sauce", "mustard", "mayo", "honey"]);

const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

export function normalizeTitle(title: string): string {
  return norm(title)
    .split(" ")
    .filter((w) => w && !TITLE_NOISE.has(w))
    .join(" ");
}

/** The ingredients that make this dish this dish: everything that isn't a
 *  pantry basic, deduped and sorted, and capped — a long tail of garnishes
 *  would make every variant a new picture. */
export function majorIngredients(ingredients: readonly string[], max = 6): string[] {
  return [...new Set(ingredients.map(norm).filter((i) => i && !PANTRY_BASICS.has(i)))].sort().slice(0, max);
}

const METHODS: [string, RegExp][] = [
  ["bake", /\b(bake|baked|oven|roast|roasted|broil)\b/],
  ["grill", /\b(grill|grilled|sear|seared)\b/],
  ["fry", /\b(fry|fried|saute|sauteed|sauté|sautéed|stir[- ]fry|pan[- ]fry|skillet|wok)\b/],
  ["boil", /\b(boil|boiled|simmer|poach|stew|soup)\b/],
  ["steam", /\b(steam|steamed)\b/],
  ["microwave", /\b(microwave|microwaved)\b/],
  ["toast", /\b(toast|toasted)\b/],
  ["blend", /\b(blend|blended|smoothie)\b/],
];

/** How it is cooked, read from the steps. "assemble" when nothing is heated. */
export function cookingMethod(steps: readonly string[]): string {
  const text = steps.join(" ").toLowerCase();
  return METHODS.find(([, pattern]) => pattern.test(text))?.[0] ?? "assemble";
}

export type RecipeIdentity = { title: string; ingredients: readonly string[]; steps: readonly string[] };

export function recipeImageKey(recipe: RecipeIdentity): string {
  const canonical = JSON.stringify({
    v: IMAGE_PROMPT_VERSION,
    title: normalizeTitle(recipe.title),
    ingredients: majorIngredients(recipe.ingredients),
    method: cookingMethod(recipe.steps),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
