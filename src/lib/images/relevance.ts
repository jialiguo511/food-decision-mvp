// Scores Pexels candidates against a Cook recommendation's image_query using
// the photo's own `alt` text — the only per-photo food description the free
// Pexels API gives us. Deliberately simple (token overlap, no ML, no extra
// API calls): the principle is "no image is better than a clearly wrong
// image", not "find the best possible image". See PLAN.md → NEXT → "Recipe
// visualization".

const STOPWORDS = new Set(["a", "an", "the", "with", "and", "of", "in", "on", "for", "to"]);

/** Lowercase word tokens with trivial plural-stripping, stopwords removed —
 *  enough to match "egg" against "eggs" without a real stemmer. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word));
}

/** Fraction (0–1) of the query's tokens found in the candidate's alt text.
 *  Missing alt text, or a query that tokenizes to nothing, scores 0. */
export function relevanceScore(queryTokens: readonly string[], altText: string): number {
  if (queryTokens.length === 0 || !altText) return 0;
  const altTokens = new Set(tokenize(altText));
  const matched = queryTokens.filter((token) => altTokens.has(token)).length;
  return matched / queryTokens.length;
}

/** A candidate needs most of the query's tokens present to count as relevant.
 *  0.6, not 0.5 (raised 2026-11-08): at one half, a two-word query matched on a single
 *  word ("tuna wrap" against any wrap), and "smoked salmon cucumber roll-ups" matched a
 *  sushi photo on "salmon" + "cucumber". Still not "all": image_query stays to the
 *  dominant dish plus one or two defining ingredients, so a real match rarely needs every
 *  token. Fewer photos is the intended cost — no photo beats a wrong one. */
export const RELEVANCE_THRESHOLD = 0.6;

// What KIND of dish something is. Token overlap alone cannot tell "salmon roll-ups" from
// "salmon sushi" — both share the ingredients and differ only in this one word. So the
// kind of dish is checked on its own, in two directions, using only the words themselves
// (no model, no extra call):
//
//   1. a kind of dish the QUERY names must appear in the photo's description
//      ("wrap" asked for, a photo of a salad is not it);
//   2. a distinctive kind of dish the PHOTO names that the query does not is a
//      contradiction ("roll-ups" asked for, a photo of sushi is not it).
//
// `words` are one kind of dish with its synonyms (as tokenize() returns them: lowercase,
// trivially de-pluralised). `distinct` kinds name a different dish outright, so seeing one
// in a photo the query did not ask for is wrong; the generic ones (bowl, salad, toast,
// yogurt, wrap) can show up incidentally ("salmon on toast") and are only checked in
// direction 1.
const FORMS: readonly { words: readonly string[]; distinct: boolean }[] = [
  { words: ["sushi", "nigiri", "sashimi", "maki", "temaki", "onigiri"], distinct: true },
  { words: ["sandwich", "sub", "panini", "toastie", "hoagie"], distinct: true },
  { words: ["wrap", "tortilla"], distinct: false },
  { words: ["burrito"], distinct: true },
  { words: ["taco"], distinct: true },
  { words: ["quesadilla"], distinct: true },
  { words: ["burger", "hamburger", "cheeseburger"], distinct: true },
  { words: ["pizza"], distinct: true },
  { words: ["pasta", "spaghetti", "lasagna", "macaroni"], distinct: true },
  { words: ["noodle", "ramen", "udon", "pho"], distinct: true },
  { words: ["soup", "stew", "broth", "chowder"], distinct: true },
  { words: ["salad"], distinct: false },
  { words: ["omelet", "omelette", "frittata"], distinct: true },
  { words: ["pancake", "waffle", "crepe"], distinct: true },
  { words: ["toast"], distinct: false },
  { words: ["smoothie", "shake"], distinct: true },
  { words: ["yogurt", "yoghurt", "parfait"], distinct: false },
  { words: ["curry"], distinct: true },
  { words: ["steak"], distinct: true },
  { words: ["fries"], distinct: true },
  { words: ["dumpling", "gyoza", "potsticker"], distinct: true },
  { words: ["cake", "cupcake", "brownie", "muffin", "pastry", "donut", "doughnut"], distinct: true },
  { words: ["cookie", "biscuit"], distinct: true },
  { words: ["dessert", "icecream", "gelato", "sundae"], distinct: true },
  { words: ["bowl"], distinct: false },
];

function formsIn(tokens: readonly string[]): Set<number> {
  const found = new Set<number>();
  FORMS.forEach((form, i) => {
    if (tokens.some((t) => form.words.includes(t))) found.add(i);
  });
  return found;
}

/** Whether the photo's description is consistent with the kind of dish the query names. */
export function formsAgree(queryTokens: readonly string[], altText: string): boolean {
  const asked = formsIn(queryTokens);
  const shown = formsIn(tokenize(altText));
  for (const form of asked) if (!shown.has(form)) return false; // 1. what was asked for isn't there
  for (const form of shown) if (FORMS[form].distinct && !asked.has(form)) return false; // 2. something else is
  return true;
}

/**
 * Picks the best-scoring candidate that clears RELEVANCE_THRESHOLD AND whose kind of dish
 * agrees with the query's, using Pexels' own result order to break ties (first candidate
 * seen wins a tie, since Pexels already ranks by its own relevance to the query). Returns
 * null when nothing qualifies — callers should treat that exactly like "no results", not
 * retry or loosen the bar. A photo with no description can never be confirmed, so it never
 * qualifies.
 */
export function selectRelevantPhoto<T>(
  query: string,
  candidates: readonly T[],
  getAltText: (candidate: T) => string,
): T | null {
  const queryTokens = tokenize(query);
  let best: { candidate: T; score: number } | null = null;
  for (const candidate of candidates) {
    const alt = getAltText(candidate);
    const score = relevanceScore(queryTokens, alt);
    if (score >= RELEVANCE_THRESHOLD && formsAgree(queryTokens, alt) && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best ? best.candidate : null;
}
