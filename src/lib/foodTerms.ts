// Normalizing the two free-form Profile lists — allergies (a safety
// constraint) and disliked foods (a preference). Kept separate from each other
// on purpose; the only thing this file does across them is make sure an
// allergy is never ALSO listed as a mere dislike.

const MAX_TERM_LENGTH = 60;
const MAX_TERMS = 40;

/** Trim, collapse whitespace, and give one consistent casing: a known chip's
 *  own spelling when it matches ("Tree nuts"), otherwise first letter up and
 *  the rest lower. Empty → null. */
export function normalizeTerm(value: string, known: readonly string[] = []): string | null {
  const collapsed = value.trim().replace(/\s+/g, " ").slice(0, MAX_TERM_LENGTH).trim();
  if (!collapsed) return null;
  const match = known.find((k) => k.toLowerCase() === collapsed.toLowerCase());
  if (match) return match;
  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1).toLowerCase();
}

/** Normalizes every entry and drops case-insensitive duplicates, keeping the
 *  first occurrence and the original order. */
export function normalizeTerms(values: readonly string[], known: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const term = normalizeTerm(raw, known);
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    out.push(term);
  }
  return out.slice(0, MAX_TERMS);
}

/** Both lists, normalized. Anything in allergies is removed from dislikes: an
 *  allergy is strictly stronger, and listing it twice would make the soft copy
 *  look like the real one. */
export function normalizeFoodLists(
  allergies: readonly string[],
  dislikes: readonly string[],
  known: { allergies?: readonly string[]; dislikes?: readonly string[] } = {},
): { allergies: string[]; dislikes: string[] } {
  const cleanAllergies = normalizeTerms(allergies, known.allergies);
  const allergic = new Set(cleanAllergies.map((a) => a.toLowerCase()));
  const cleanDislikes = normalizeTerms(dislikes, known.dislikes).filter((d) => !allergic.has(d.toLowerCase()));
  return { allergies: cleanAllergies, dislikes: cleanDislikes };
}

/** The words to look for in text for one allergy entry: the entry itself plus
 *  its singular/plural ("Peanuts" → peanut, peanuts), and each side of a
 *  combined chip ("Wheat / gluten" → wheat, gluten). Deliberately literal —
 *  there is no alias table, so "Shellfish" does not match "shrimp". */
function allergenWords(allergy: string): string[] {
  const words = new Set<string>();
  for (const part of allergy.toLowerCase().split(/[\/,]/)) {
    const base = part.trim().replace(/\s+/g, " ");
    if (base.length < 3) continue;
    words.add(base);
    if (base.endsWith("es") && base.length > 4) words.add(base.slice(0, -2));
    if (base.endsWith("s")) words.add(base.slice(0, -1));
    else words.add(`${base}s`);
  }
  return [...words];
}

/** The allergies (as the user listed them) that `text` names outright. A
 *  second safety layer behind the prompt, not an allergen database: it catches
 *  only the allergen's own name at a word boundary ("peanut sauce", "Peanuts",
 *  not "eggplant" for Eggs). It cannot know a dish's hidden ingredients, so an
 *  empty result never means the text is safe. A negated mention ("peanut-free")
 *  still counts — erring toward hiding is the point. */
export function findAllergenMentions(text: string, allergies: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  return allergies.filter((allergy) => {
    const normalized = normalizeTerm(allergy);
    if (!normalized) return false;
    return allergenWords(normalized).some((word) => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(haystack);
    });
  });
}

/** The same literal matcher for a list that is a preference, not a safety rule
 *  (Profile dislikes) — used only for a lighter "may not fit" note. */
export const findFoodTermMentions = findAllergenMentions;
