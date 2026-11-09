// A photo for an "Order it" / "Grab it" card — an ILLUSTRATION of the kind of food, never
// of a real place and never generated. Real photo only, through the same provider, the
// same relevance bar (relevance.ts) and the same 24 h cache as a recipe's photo; nothing
// here can spend on image generation, and there is no image-recognition step.
//
// These cards have no `image_query` (the model isn't asked for one — it would cost output
// tokens on every request), so the search words come from the card's own title, and the
// RESULT is what is checked: a candidate is used only if its description matches the
// title's words and agrees on the kind of dish. When that can't be confirmed there is no
// photo, and the card shows the same quiet placeholder a recipe does.

import type { OrderRecommendation, StoreSnackRecommendation } from "../types";
import type { ImageProvider, ImageResult } from "./provider";

/** Words that describe a card's tone, not the food — a photo's description won't contain
 *  them, so leaving them in would reject good photos. */
const NOISE = new Set([
  "quick", "easy", "simple", "light", "lighter", "fresh", "homemade", "classic", "big", "small", "mini", "protein", "high", "healthy",
  "style", "extra", "plain", "favorite", "favourite", "good", "best", "bite", "pick", "order", "grab", "snack", "meal", "option", "combo",
]);

const STOP = new Set(["a", "an", "the", "with", "and", "of", "in", "on", "for", "to", "topped", "served"]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z]+/)
    .filter((w) => w.length > 1 && !NOISE.has(w) && !STOP.has(w));
}

/** The search phrases for a card, most specific first, at most two:
 *  the whole title, then — only if it names more than the dish — the part before
 *  "with" / "and" / "&" / a comma ("Cottage cheese with canned tuna" → "cottage cheese"). */
export function ideaImageQueries(card: Pick<OrderRecommendation | StoreSnackRecommendation, "title">): string[] {
  const title = card.title;
  const full = words(title).join(" ");
  if (!full) return [];
  const head = words(title.split(/\s+(?:with|and|&|topped|served)\s+|,/i)[0] ?? "").join(" ");
  return head && head !== full && head.split(" ").length >= 1 ? [full, head] : [full];
}

/** The first query that yields a relevant photo, or null. A provider that throws is
 *  treated as "no photo" — an illustration is never worth an error. */
export async function resolveIdeaImage(card: Pick<OrderRecommendation | StoreSnackRecommendation, "title">, photos: ImageProvider): Promise<ImageResult | null> {
  for (const query of ideaImageQueries(card)) {
    try {
      const photo = await photos.resolve(query);
      if (photo) return photo;
    } catch (error) {
      console.warn("[images] idea photo lookup errored", error instanceof Error ? error.message : error);
    }
  }
  return null;
}
