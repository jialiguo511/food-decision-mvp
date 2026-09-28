// The seam between "what dish is this" (a recommendation's `image_query`)
// and "an actual image for it". See PLAN.md → NEXT → "Recipe visualization".
// The image source is a separate decision from the app's own code: Pexels is
// the first ImageProvider (see pexels.ts), but nothing outside this module
// and pexels.ts knows that — a later swap to a curated library or AI
// generation only touches this file's implementations, never a caller.

export type ImageResult = {
  url: string;
  /** Attribution is required by Pexels' terms and is never dropped just to
   *  return a bare URL — see RecipeImage, which renders it. */
  photographerName: string;
  photographerUrl: string;
  /** The photo's page on the provider's site (not the raw image URL). */
  sourceUrl: string;
};

export interface ImageProvider {
  resolve(query: string): Promise<ImageResult | null>;
}

/** No image source configured. Every lookup resolves to null, i.e. the
 *  fallback/no-image state — used when PEXELS_API_KEY is unset, so a missing
 *  key degrades to "no image" rather than breaking anything. */
export const noImageProvider: ImageProvider = {
  async resolve() {
    return null;
  },
};
