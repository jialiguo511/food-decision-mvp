// Keeps places whose NAME or TYPE centers on something the user can't eat out
// of the nearby picks — as code now, where it used to be a prompt instruction
// the model followed while choosing. Hard constraints (allergies, the dietary
// pattern) decide which places are eligible at all; everything else only ranks.
//
// What this is and is not: the places data has no menu, so the only thing that
// can be checked is a place's name and type label. This removes the obvious
// ones (a sushi place for a fish allergy, a steakhouse for a vegetarian) with a
// short literal keyword table plus the allergy's own name. It cannot know what
// a kitchen uses, cannot see hidden ingredients or cross-contact, and an empty
// result never means "safe" — the nearby screen says so, and the model's
// "what to look for" guidance is held to the same rule. Halal and kosher
// sourcing can't be read from a name at all and are not inferred here.
// Extend the tables, don't special-case in callers.

import { findAllergenMentions } from "../foodTerms";
import type { PlaceCandidate } from "../places/candidates";
import type { DietaryPattern } from "../types";

/** Allergy chip → words in a place's name/type that center on it. */
const ALLERGEN_PLACE_WORDS: Record<string, readonly string[]> = {
  peanuts: ["peanut"],
  "tree nuts": ["nut"],
  shellfish: ["seafood", "oyster", "crab", "lobster", "shrimp", "crawfish", "clam"],
  fish: ["seafood", "sushi", "fish", "poke", "oyster"],
  dairy: ["ice cream", "gelato", "creamery", "cheese", "dairy", "frozen yogurt", "pizza"],
  eggs: ["egg", "omelet", "omelette"],
  soy: ["tofu", "soy"],
  "wheat / gluten": ["bakery", "pizza", "pasta", "noodle", "ramen", "bagel", "sandwich", "donut", "pastry"],
  sesame: ["sesame"],
};

/** Dietary pattern → words in a place's name/type that center on what it excludes. */
const PATTERN_PLACE_WORDS: Partial<Record<DietaryPattern, readonly string[]>> = {
  vegetarian: ["steak", "barbecue", "bbq", "seafood", "sushi", "chicken", "kebab", "meat", "rib", "wings"],
  vegan: ["steak", "barbecue", "bbq", "seafood", "sushi", "chicken", "kebab", "meat", "rib", "wings", "ice cream", "gelato", "creamery", "cheese", "pizza", "dairy", "bakery"],
  pescatarian: ["steak", "barbecue", "bbq", "chicken", "kebab", "meat", "rib", "wings"],
};

/** Whole-word (plural allowed) match, so "nut" never fires on "donut". */
const hasWord = (label: string, word: string) =>
  new RegExp(`(?<![a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?(?![a-z])`).test(label);

const labelOf = (place: PlaceCandidate) =>
  `${place.name} ${place.category ?? ""} ${(place.primary_type ?? "").replace(/_/g, " ")}`.toLowerCase();

/** Why this place can't be recommended to this user, or null when it can. */
export function exclusionReason(
  place: PlaceCandidate,
  constraints: { allergies: readonly string[]; dietary_patterns: readonly DietaryPattern[] },
): string | null {
  const label = labelOf(place);
  if (findAllergenMentions(label, constraints.allergies).length > 0) return "allergy";
  for (const allergy of constraints.allergies) {
    const words = ALLERGEN_PLACE_WORDS[allergy.trim().toLowerCase()];
    if (words?.some((w) => hasWord(label, w))) return "allergy";
  }
  for (const pattern of constraints.dietary_patterns) {
    if (PATTERN_PLACE_WORDS[pattern]?.some((w) => hasWord(label, w))) return "dietary";
  }
  return null;
}

export function withoutExcludedPlaces(
  candidates: readonly PlaceCandidate[],
  constraints: { allergies: readonly string[]; dietary_patterns: readonly DietaryPattern[] },
): PlaceCandidate[] {
  return candidates.filter((c) => exclusionReason(c, constraints) === null);
}
