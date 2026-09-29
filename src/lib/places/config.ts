// Every tunable for Nearby Eat out lives here, so nothing is a magic number
// scattered through the provider, the candidate filter, or the route.
// Type strings are from Places API (New) "Table A" — verified against the
// official place-types page, not guessed. If a string is ever wrong the API
// rejects the request with 400 rather than silently returning nothing.

/** Search radius around the user. ~1 mile: "somewhere I'd actually go right
 *  now." No radius UI in v1 — change it here. (API maximum is 50,000 m.) */
export const NEARBY_RADIUS_METERS = 1600;

/** Places API (New) Nearby Search returns 1–20 results. We ask for the max
 *  and filter down; the recommender then picks three of what's left. */
export const NEARBY_MAX_RESULTS = 20;

/** Cap on candidates handed to the recommender after filtering. */
export const MAX_CANDIDATES = 20;

export const PLACES_TIMEOUT_MS = 8000;

/** Places a person could realistically get food from right now. `includedTypes`
 *  matches ANY of a place's types, not just its primary one. */
export const INCLUDED_TYPES = [
  "restaurant",
  "cafe",
  "coffee_shop",
  "bakery",
  "meal_takeaway",
  "fast_food_restaurant",
] as const;

/** Places whose *primary* purpose is something else. Excluding by primary type
 *  (not `excludedTypes`) keeps a restaurant that merely also has a bar, and
 *  drops a bar that merely also serves food. Also re-checked client-side in
 *  candidates.ts, since the provider is the less trustworthy party. */
export const EXCLUDED_PRIMARY_TYPES = [
  "bar",
  "pub",
  "wine_bar",
  "cocktail_bar",
  "lounge_bar",
  "irish_pub",
  "brewery",
  "brewpub",
  "hookah_bar",
  "night_club",
  "liquor_store",
  "grocery_store",
  "supermarket",
  "convenience_store",
] as const;

/**
 * The field mask — deliberately narrow, and the single place cost is decided.
 * Billing for Nearby Search is by the highest SKU any requested field falls
 * in (per Google's data-fields table):
 *  - Pro:        id, displayName, location, shortFormattedAddress,
 *                primaryType, primaryTypeDisplayName, googleMapsUri,
 *                businessStatus
 *  - Enterprise: currentOpeningHours, priceLevel, rating, websiteUri, …
 * MVP DECISION (deliberate, not an oversight): we ask for
 * `currentOpeningHours.openNow` and `priceLevel`, which puts each request at
 * the Enterprise tier, because this product answers "what should I eat right
 * now?" — recommending a closed place is the most obvious way this feature can
 * be wrong, and price level is the only real evidence we ever have for a
 * budget claim. Revisit this if usage scales: the mask is centralized HERE
 * precisely so the cost/utility tradeoff can be changed in one place. The
 * feature does not depend on either field — drop the two Enterprise entries
 * below and every request falls to Pro, with open_now / price_level simply
 * coming back null. Do not add more Enterprise or Atmosphere fields.
 * Never requested: reviews, photos, rating, editorial/generative summaries,
 * and other Atmosphere fields.
 *
 * COST CONTROL: one explicit user action = one Places request (no automatic
 * retries, no polling; see useRecommend's in-flight guard). Configure
 * project-level Google Cloud quotas and budget alerts before any public
 * launch — that, not app code, is the backstop against runaway spend.
 */
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.shortFormattedAddress",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.currentOpeningHours.openNow",
  "places.priceLevel",
].join(",");
