// Nearby Eat out, step one: pick the three places from the provider's real
// candidates with plain code — no model — so they can be shown the moment the
// Places search returns. A model is only asked afterwards, for the wording
// ("why this fits", "what to look for"); see enrich.ts. Everything the places
// data genuinely knows ranks here: open now, distance against how far the user
// would go, price level against their meal budget, their own "not for me"
// feedback (all in feasibility.ts), plus a small, soft craving fit.
//
// Craving fit is the one judgment call. A craving ("warm & comforting") isn't
// structured data, so it is only a nudge — a keyword match on the provider's
// own type/category label and on the user's typed craving against the place
// name/category — and it never excludes anything. The keyword lists are the
// tunables; keep them short and literal.

import type { PlaceCandidate } from "../places/candidates";
import { budgetFit } from "./budget";
import { assessFeasibility, type FeasibilityPrefs } from "./feasibility";
import type { NearbyRecommendation, OrderCravingCategory, RecommendationRole } from "../types";

/** Points for a craving match. Open-now is worth 0.5 in feasibility, distance up
 *  to -3, so a craving match outweighs "open" but not a long trip. */
export const CRAVING_FIT_POINTS = 1;

const CATEGORY_KEYWORDS: Record<Exclude<OrderCravingCategory, "no_preference">, readonly string[]> = {
  meaty: ["steak", "barbecue", "bbq", "burger", "korean", "grill", "chicken", "kebab", "brazilian", "hamburger", "meat"],
  warm_comforting: ["ramen", "soup", "pho", "noodle", "curry", "indian", "thai", "dumpling", "diner", "comfort", "pizza", "italian"],
  fresh_light: ["salad", "vegetarian", "vegan", "juice", "smoothie", "mediterranean", "poke", "sushi", "greek", "health"],
  sweet: ["dessert", "bakery", "ice cream", "ice_cream", "gelato", "donut", "pastry", "chocolate", "candy", "bubble", "yogurt", "cafe", "coffee"],
};

const STOP_WORDS = new Set(["the", "and", "with", "some", "something", "food", "place", "good", "like", "want"]);

const words = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

/** Whether this place matches the craving (the chip and/or the typed note). */
export function cravingMatches(place: PlaceCandidate, craving: OrderCravingCategory, note: string | null): boolean {
  const label = `${place.primary_type ?? ""} ${place.category ?? ""} ${place.name}`.toLowerCase().replace(/_/g, " ");
  if (craving !== "no_preference" && CATEGORY_KEYWORDS[craving].some((k) => label.includes(k.replace(/_/g, " ")))) return true;
  if (note) return words(note).some((w) => label.includes(w));
  return false;
}

export type NearbyPickPrefs = FeasibilityPrefs & {
  craving_category: OrderCravingCategory;
  craving_note: string | null;
};

type Scored = { place: PlaceCandidate; score: number; matches: boolean };

function scoreAll(candidates: readonly PlaceCandidate[], prefs: NearbyPickPrefs): Scored[] {
  return candidates
    .map((place) => {
      const matches = cravingMatches(place, prefs.craving_category, prefs.craving_note);
      return { place, matches, score: assessFeasibility(place, prefs).score + (matches ? CRAVING_FIT_POINTS : 0) };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.place.distance_m ?? Infinity) - (b.place.distance_m ?? Infinity) ||
        a.place.id.localeCompare(b.place.id),
    );
}

const typeOf = (p: PlaceCandidate) => p.primary_type ?? p.category ?? p.id;

/**
 * Up to three places, one per role:
 *   best_match    — the highest combined score;
 *   lowest_effort — of the rest, the nearest that isn't a weak fit;
 *   alternative   — of the rest, the best-scoring place of a different kind.
 * Exactly three when three or more candidates exist, else all of them (never
 * padded). Fully deterministic: same inputs, same picks, same order.
 */
export function pickNearby(candidates: readonly PlaceCandidate[], prefs: NearbyPickPrefs): NearbyRecommendation[] {
  const ranked = scoreAll(candidates, prefs);
  if (ranked.length === 0) return [];

  const chosen: { role: RecommendationRole; item: Scored }[] = [];
  const take = (role: RecommendationRole, item: Scored | undefined) => {
    if (item) chosen.push({ role, item });
  };
  const left = () => ranked.filter((r) => !chosen.some((c) => c.item === r));

  take("best_match", ranked[0]);

  const nearestFirst = [...left()].sort(
    (a, b) =>
      (a.place.distance_m ?? Infinity) - (b.place.distance_m ?? Infinity) || b.score - a.score || a.place.id.localeCompare(b.place.id),
  );
  take("lowest_effort", nearestFirst.find((r) => r.score > -1.5) ?? nearestFirst[0]);

  const usedTypes = new Set(chosen.map((c) => typeOf(c.item.place)));
  const rest = left();
  take("alternative", rest.find((r) => !usedTypes.has(typeOf(r.place))) ?? rest[0]);

  return chosen.map(({ role, item }) => toRecommendation(role, item, prefs));
}

/** The rule-written reason: only what the places data knows, no menu claims. */
export function ruleReason(role: RecommendationRole, matches: boolean, place: PlaceCandidate, prefs: NearbyPickPrefs): string {
  const facts = [
    matches ? "fits what you're after" : null,
    place.open_now === true ? "open now" : null,
    place.distance_m !== null && place.distance_m <= 800 ? "close by" : null,
    budgetFit(prefs.meal_budget, place.price_level) === "likely_fit" && prefs.meal_budget !== "no_preference" ? "likely within your budget" : null,
  ].filter((f): f is string => f !== null);
  const lead = role === "lowest_effort" ? "One of the easiest to get to" : role === "alternative" ? "A different kind of place" : "A strong pick";
  return facts.length > 0 ? `${lead}: ${facts.join(", ")}.` : `${lead} near you.`;
}

function toRecommendation(role: RecommendationRole, { place, matches }: Scored, prefs: NearbyPickPrefs): NearbyRecommendation {
  return {
    decision_mode: "nearby",
    role,
    title: place.name,
    place_id: place.id,
    reason: ruleReason(role, matches, place, prefs),
    // The model's guidance arrives afterwards (enrich.ts); null until then.
    look_for: null,
    category: place.category,
    address: place.address,
    distance_m: place.distance_m,
    open_now: place.open_now === true ? true : null,
    price_level: place.price_level,
    maps_url: place.maps_url,
    website_url: place.website_url,
    enriched: false,
    photo_name: place.photo_name ?? null,
    photo_author: place.photo_author ?? null,
  };
}
