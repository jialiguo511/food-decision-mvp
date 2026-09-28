// The server-side half of "Use what I have". The prompt tells the model to use
// only availableIngredients (tonight's foods + Kitchen staples) plus water;
// this is the check that notices when it didn't. Before this existed, the
// only guard was that `ingredients_needed` was empty — so a recipe could
// still quietly rely on rice or avocado by listing it under
// `ingredients_on_hand`.
//
// Matching is deliberately forgiving about wording ("1 chicken breast
// (palm-sized)" matches an available "Chicken") and strict about substance
// (rice never matches chicken and spinach). It only judges the structured
// `ingredients_on_hand` field. Free-text steps are held to the same rule by the
// prompt alone — there is no reliable way to parse them.

/** Words that describe a quantity, size, or state rather than which food it is.
 *  Dropped before comparing so "2 large handfuls of fresh spinach" reduces to
 *  "spinach". Sourcing words (frozen, canned) are here too: an available item
 *  named "Frozen veg" and a model line "frozen broccoli" share the word
 *  "frozen", which must not count as a match on its own. */
const FILLER = new Set([
  "a", "an", "the", "of", "about", "some", "few", "little", "optional",
  "cup", "tbsp", "tsp", "tablespoon", "teaspoon", "oz", "ounce", "lb", "pound", "gram", "g", "kg", "ml", "l",
  "handful", "pinch", "dash", "slice", "piece", "clove", "can", "bag", "bunch",
  "large", "medium", "small", "big", "half", "whole", "palm", "sized", "size",
  "fresh", "frozen", "canned", "dried", "cooked", "raw", "sliced", "diced", "chopped", "minced", "ground",
  "boneless", "skinless", "mixed", "baby", "leftover",
]);

/** The only ingredient Cook may assume without it appearing in
 *  availableIngredients — see CLAUDE.md's canonical availability rule. Salt,
 *  pepper, and oil are NOT free any more: they only count when the user saved
 *  them under Kitchen staples, exactly like anything else. */
const STAPLE_CORE = new Set(["water"]);
const STAPLE_MODIFIERS = new Set(["tap", "cold", "hot", "warm"]);

function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("oes")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The food words in an ingredient line, minus quantities and descriptors. */
function foodWords(line: string): string[] {
  const withoutParens = line.toLowerCase().replace(/\([^)]*\)/g, " ");
  const words = withoutParens.match(/[a-z]+/g) ?? [];
  return words.map(singular).filter((word) => !FILLER.has(word));
}

/** "rice and chicken" is two ingredients, and each must be checked on its own. */
function splitIngredients(line: string): string[][] {
  return line
    .split(/,|;|\+|&|\band\b|\bor\b|\bwith\b/i)
    .map(foodWords)
    .filter((words) => words.length > 0);
}

function isStaple(words: string[]): boolean {
  return (
    words.some((word) => STAPLE_CORE.has(word)) &&
    words.every((word) => STAPLE_CORE.has(word) || STAPLE_MODIFIERS.has(word))
  );
}

function isSubset(small: readonly string[], large: readonly string[]): boolean {
  return small.length > 0 && small.every((word) => large.includes(word));
}

/** The parts of `line` that are neither a staple nor something in `available`.
 *  Empty means the line is fully covered. Returned as words, for the error. */
export function ingredientsOutsideInventory(line: string, available: readonly string[]): string[] {
  const inventory = available.map(foodWords);
  return splitIngredients(line)
    .filter((words) => !isStaple(words))
    // Either direction: "chicken breast" is covered by an available "chicken",
    // and an available "chicken breast" covers a line that just says "chicken".
    .filter((words) => !inventory.some((item) => isSubset(item, words) || isSubset(words, item)))
    .map((words) => words.join(" "));
}
