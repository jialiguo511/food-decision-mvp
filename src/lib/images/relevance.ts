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

/** A candidate needs at least half of the query's tokens present to count as
 *  relevant. Half, not all: image_query is meant to stay to the dominant
 *  dish plus one or two defining ingredients (see prompt.ts), so a real
 *  match rarely needs every token, but a dish missing most of them (avocado
 *  toast for a "peanut butter toast" query) is the wrong photo, not a loose
 *  match. */
export const RELEVANCE_THRESHOLD = 0.5;

/**
 * Picks the best-scoring candidate that clears RELEVANCE_THRESHOLD, using
 * Pexels' own result order to break ties (first candidate seen wins a tie,
 * since Pexels already ranks by its own relevance to the query). Returns
 * null when nothing clears the bar — callers should treat that exactly like
 * "no results", not retry or loosen the bar.
 */
export function selectRelevantPhoto<T>(
  query: string,
  candidates: readonly T[],
  getAltText: (candidate: T) => string,
): T | null {
  const queryTokens = tokenize(query);
  let best: { candidate: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = relevanceScore(queryTokens, getAltText(candidate));
    if (score >= RELEVANCE_THRESHOLD && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best ? best.candidate : null;
}
