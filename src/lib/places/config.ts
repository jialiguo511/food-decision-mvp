// Every tunable for Nearby Eat out lives here, so nothing is a magic number
// scattered through the provider, the candidate filter, or the route.
// Type strings are from Places API (New) "Table A" — verified against the
// official place-types page, not guessed. If a string is ever wrong the API
// rejects the request with 400 rather than silently returning nothing.

import type { TravelWillingness } from "../types";

/** What each "How far would you go?" answer means, in ONE place so it is easy
 *  to tune. `radius_m` is the Places search radius (API maximum is 50,000 m).
 *  The other two fields shape the deterministic distance-fit score
 *  (recommend/feasibility.ts): distance is free up to `comfortable_m`, then
 *  costs up to `distance_weight` points by the time it reaches `radius_m`.
 *  Walkable therefore punishes distance hard; worth_a_trip barely does, and
 *  neither gives distance a bonus — far is never better, only cheaper.
 *  no_preference is the moderate default (also used for delivery, which
 *  never asks the question). */
export const TRAVEL_SEARCH = {
  walkable: { radius_m: 1200, comfortable_m: 500, distance_weight: 3 },
  nearby: { radius_m: 4500, comfortable_m: 1500, distance_weight: 2 },
  worth_a_trip: { radius_m: 11000, comfortable_m: 5000, distance_weight: 1 },
  no_preference: { radius_m: 3000, comfortable_m: 1500, distance_weight: 1.5 },
} as const satisfies Record<TravelWillingness, { radius_m: number; comfortable_m: number; distance_weight: number }>;

/** Deterministic feasibility scoring, applied before the model sees anything.
 *  Points, not probabilities: higher is more feasible right now. Budget is
 *  soft — coarse price levels never remove a place on their own — so its
 *  scores sit in the same range as distance and open-now, not above them. */
export const FEASIBILITY = {
  /** Known open right now. Unknown hours score 0 (known-closed never gets here). */
  open_now: 0.5,
  /** A tight budget (under $15) plus a clearly low provider price level. */
  budget_low_fit_bonus: 1,
  /** Provider price level is one step above what the band comfortably covers. */
  budget_may_be_over: -1,
  /** Two or more steps above it. */
  budget_unlikely_fit: -2.5,
  /** The user said "not for me" softly (too expensive, other). Sized like the
   *  worst budget mismatch: enough to fall to "weak" and be held back while
   *  enough other places exist, never enough to remove the place. */
  user_downrank: -2.5,
  /** Total score at or above → "strong"; at or below → "weak"; else "ok". */
  strong_at: 0.5,
  weak_at: -1.5,
} as const;

/** The shortlist handed to the model: big enough for a real choice and for
 *  variety, small enough that feasibility matters. */
export const SHORTLIST = {
  size: 10,
  /** "weak" places are held back only while at least this many non-weak places
   *  exist — a soft, rank-based cut, never a hard filter. */
  min_non_weak: 6,
  /** At most this many of the same kind of place before backfilling. */
  max_per_type: 3,
} as const;

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
 *  - Enterprise: currentOpeningHours, priceLevel, websiteUri, rating, …
 * MVP DECISION (deliberate, not an oversight): we ask for
 * `currentOpeningHours.openNow` and `priceLevel`, which puts each request at
 * the Enterprise tier, because this product answers "what should I eat right
 * now?" — recommending a closed place is the most obvious way this feature can
 * be wrong, and price level is the only real evidence we ever have for a
 * budget claim. Revisit this if usage scales: the mask is centralized HERE
 * precisely so the cost/utility tradeoff can be changed in one place. The
 * feature does not depend on either field — drop the two Enterprise entries
 * below and every request falls to Pro, with open_now / price_level simply
 * coming back null. `websiteUri` is also Enterprise, so it rides in the tier
 * the request is already billed at — it adds no cost and is the only reliable
 * destination URL Places offers (there is no menu, menu-URL, or ordering
 * field). Drop it together with the other two if the mask is ever cut to Pro.
 * Do not add more Enterprise or Atmosphere fields.
 * Never requested: reviews, rating, editorial/generative summaries, and other
 * Atmosphere fields. Photos are requested by explicit decision — see the entry
 * in the mask below.
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
  "places.websiteUri",
  // Added 2026-10-02 at the founder's explicit request (a restaurant card shows a
  // real photo of the place, never a generated one). Only the photo REFERENCE
  // (name + author) comes back here; the picture itself is a separate, billed
  // "Place Photos" request made lazily, per card shown, by /api/place-photo.
  // That second request — roughly three per nearby search if every card is seen —
  // is the real cost of this field; see PLAN.md / LEARNINGS.md.
  "places.photos.name",
  "places.photos.authorAttributions.displayName",
].join(",");
