// Literal, conservative checks on a generated COOK recipe's own text — the
// backstop behind two prompt rules the model has been seen to break:
//   * equipment: "while the rice heats in the microwave" for a user who never
//     said they own one;
//   * dietary pattern: meat in a vegetarian recipe.
// Same limits as the allergen check (foodTerms.ts): whole-word matches on a
// short, fixed vocabulary, no aliases or hidden ingredients. A clean result
// never means "suitable" — the product makes no such claim. A hit rejects the
// set (the generator retries once), so the lists stay short and the patterns
// avoid common false positives ("peanut butter", "coconut milk", "grilled").

import type { CookRecommendation, DietaryConstraint } from "../types";

/** Everything a recipe says: title, ingredients, steps. */
export function recipeText(r: Pick<CookRecommendation, "title" | "ingredients_on_hand" | "ingredients_needed" | "steps">): string {
  return [r.title, ...r.ingredients_on_hand, ...r.ingredients_needed, ...r.steps].join("\n");
}

// --- equipment -------------------------------------------------------------

/** The named appliances a step can lean on, keyed by the EQUIPMENT label that
 *  makes each one allowed. Not exhaustive on purpose — only unambiguous words. */
const APPLIANCE_WORDS: { owns: string; label: string; pattern: RegExp }[] = [
  { owns: "Microwave", label: "microwave", pattern: /\bmicrowav(?:e|es|ed|ing)\b/i },
  { owns: "Oven", label: "oven", pattern: /(?<!toaster[\s-])(?<!dutch[\s-])\boven\b/i },
  { owns: "Toaster oven", label: "toaster oven", pattern: /\btoaster[\s-]oven\b/i },
  { owns: "Air fryer", label: "air fryer", pattern: /\bair[\s-]?fr(?:yer|ied|ying|y)\b/i },
  { owns: "Rice cooker", label: "rice cooker", pattern: /\brice[\s-]cooker\b/i },
  { owns: "Blender", label: "blender", pattern: /\bblender\b/i },
  { owns: "Instant Pot", label: "Instant Pot / pressure cooker", pattern: /\binstant[\s-]pot\b|\bpressure[\s-]cooker\b/i },
  { owns: "Grill", label: "grill", pattern: /\bgrill\b(?![\s-]pan)/i },
  { owns: "Stovetop", label: "stovetop", pattern: /\bstove(?:top)?\b/i },
];

/** Appliances named in the recipe's text that the user doesn't own. `owned` is
 *  the constraint's equipment list (empty for "no cooking" / unknown). */
export function findUnownedApplianceMentions(text: string, owned: readonly string[]): string[] {
  return APPLIANCE_WORDS.filter((a) => !owned.includes(a.owns) && a.pattern.test(text)).map((a) => a.label);
}

// --- dietary pattern -------------------------------------------------------

/** Words that make a following food word not the animal one. */
const NOT_ANIMAL = "vegan|vegetarian|plant[\\s-]based|meatless|meat[\\s-]free|imitation|faux|mock|coconut|almond|oat|soy|rice|cashew|nut|peanut|cocoa|shea";
const food = (words: string) => new RegExp(`(?<!(?:${NOT_ANIMAL})[\\s-])\\b(?:${words})\\b`, "i");

const MEAT = "chicken|beef|pork|bacon|ham|turkey|lamb|veal|duck|sausages?|salami|pepperoni|prosciutto|pancetta|chorizo|meatballs?|brisket|ground meat|lard";
const SEAFOOD = "fish|salmon|tuna|shrimps?|prawns?|crab|lobster|cod|tilapia|anchov(?:y|ies)|sardines?|scallops?|clams?|mussels?|oysters?|squid|calamari";
const PORK = "pork|bacon|ham|prosciutto|pancetta|pepperoni|lard";
const SHELLFISH = "shrimps?|prawns?|crab|lobster|scallops?|clams?|mussels?|oysters?";
const ANIMAL_PRODUCTS = "eggs?|cheese|milk|butter|honey|yogurt|yoghurt|whey";

const CHECKS: Record<string, { label: string; pattern: RegExp }> = {
  vegetarian: { label: "meat or fish", pattern: food(`${MEAT}|${SEAFOOD}`) },
  vegan: { label: "an animal product", pattern: food(`${MEAT}|${SEAFOOD}|${ANIMAL_PRODUCTS}`) },
  pescatarian: { label: "meat", pattern: food(MEAT) },
  halal: { label: "pork", pattern: food(PORK) },
  kosher: { label: "pork or shellfish", pattern: food(`${PORK}|${SHELLFISH}`) },
};

/** Patterns the recipe text visibly breaks, e.g. ["vegetarian (chicken)"].
 *  Prompt-level rules (alcohol, halal sourcing, meat + dairy) have no literal
 *  check here. `other` free text is never checked — it is the user's words. */
export function findDietaryViolations(text: string, dietary: DietaryConstraint): string[] {
  return dietary.patterns.flatMap((pattern) => {
    const check = CHECKS[pattern];
    const hit = check?.pattern.exec(text);
    return hit ? [`${pattern} (${hit[0].toLowerCase()})`] : [];
  });
}

// --- no cooking ------------------------------------------------------------

/** What "No cooking at all" means inside Make something: the user ASSEMBLES a
 *  meal from ready-to-eat things — opening, slicing, spreading, mixing. No heat
 *  of any kind (stove, oven, microwave, toaster…), and not a prepared hot meal
 *  bought as the meal either: that is Get food, not Make something. Buying
 *  ready-to-eat ingredients (canned tuna, rotisserie chicken, a salad kit,
 *  smoked salmon, deli turkey) is fine.
 *
 *  Literal and conservative, same limits as the checks above: whole words on a
 *  short vocabulary, no aliases. It rejects on a clear hit rather than trying
 *  to prove a recipe is cold. */

/** Cooking / heating done by the user, in an instruction. Base and -ing forms
 *  only: past participles are how ready-to-eat things are described
 *  ("pre-cooked lentils", "roasted red peppers", "baked beans"). */
const COOKING_ACTIONS =
  /\b(?:cook(?:ing)?|re-?heat(?:ing)?|heat(?:ing)?|warm(?:ing)?\s+up|microwav(?:e|ing)|bak(?:e|ing)|boil(?:ing)?|simmer(?:ing)?|fry(?:ing)?|air[\s-]?fry(?:ing)?|saut[eé](?:ing)?|sear(?:ing)?|broil(?:ing)?|grill(?:ing)?|roast(?:ing)?|steam(?:ing)?|poach(?:ing)?|melt(?:ing)?|scramble|scrambling)\b/i;
/** "No cooking needed", "without heating" — saying there is no heat is not heat. */
const NEGATED_HEAT = /\b(?:no|without|zero|skip(?:ping)?|not\s+needed?)\s+(?:the\s+)?(?:cooking|heating|heat|stove|oven)\b|\bno[\s-]cook\b/gi;
/** "Toast the bread" is heat; "on toast" is just a food. Only the verb, at the start of a step. */
const TOAST_STEP = /(?:^|\n)\s*toast\b/i;
/** "heated through", "warmed", "reheated" — heat described as a state. */
const HEATED_STATE = /\b(?:re-?heated|heated|warmed|piping)\b/i;
/** Hot as an adjective on food ("hot rice", "serve hot"). Hot sauce, hot honey,
 *  hot peppers and hot dogs are cold-fine ingredients, not heat. */
const HOT_FOOD = /\bhot\b(?![\s-]+(?:sauce|honey|peppers?|chil(?:i|li|e)s?\w*|mustard|dogs?|cocoa|chocolate)\b)/i;
/** A bought, finished meal rather than ingredients to assemble. */
const PREPARED_MEAL =
  /\b(?:hot[\s-]bar|steam[\s-]table|prepared\s+(?:meals?|entr[eé]es?|dinners?|plates?)|ready[\s-]?made\s+(?:meals?|entr[eé]es?|dinners?)|ready\s+meals?|frozen\s+(?:meals?|dinners?|entr[eé]es?)|take[\s-]?out|takeaway|restaurant|cooked[\s-]to[\s-]order|freshly\s+(?:cooked|grilled|fried|baked))\b/i;

/** Why this recipe isn't a no-cook meal, e.g. ["cooking step (heat)"]; empty when
 *  nothing in its text calls for heat or a bought hot meal. Checks steps for
 *  cooking actions and the whole text for hot food / a prepared meal. */
export function findNoCookViolations(r: Pick<CookRecommendation, "title" | "ingredients_on_hand" | "ingredients_needed" | "steps">): string[] {
  const problems: string[] = [];
  const steps = r.steps.join("\n").replace(NEGATED_HEAT, " ");
  const action = COOKING_ACTIONS.exec(steps) ?? HEATED_STATE.exec(steps) ?? TOAST_STEP.exec(steps);
  if (action) problems.push(`a cooking or heating step (${action[0].toLowerCase()})`);
  const text = recipeText(r);
  const hot = HOT_FOOD.exec(text);
  if (hot) problems.push(`hot food (${hot[0].toLowerCase()})`);
  const prepared = PREPARED_MEAL.exec(text);
  if (prepared) problems.push(`a bought prepared meal (${prepared[0].toLowerCase()})`);
  return problems;
}
