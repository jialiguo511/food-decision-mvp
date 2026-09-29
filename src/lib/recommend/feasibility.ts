// The deterministic step between "places the provider returned" and "places
// the model ranks": score each candidate on what we can actually know — open
// now, distance against travel willingness, and the coarse price level against
// the meal budget — then hand the model a diverse shortlist instead of every
// candidate. Craving, hunger, cuisine and variety are still the model's job.
//
// Everything here is soft. Budget in particular never removes a place by
// itself: an unknown price is neutral, a roomy budget never penalizes a cheap
// place, and a place that scores badly is held back only while enough better
// places exist to fill a real choice.

import type { PlaceCandidate } from "../places/candidates";
import { FEASIBILITY, SHORTLIST, TRAVEL_SEARCH } from "../places/config";
import type { MealBudget, TravelWillingness } from "../types";
import { budgetScore } from "./budget";

export type FeasibilityTier = "strong" | "ok" | "weak";

export type FeasibilityPrefs = { meal_budget: MealBudget; travel: TravelWillingness };

export type Feasibility = {
  open: number;
  budget: number;
  /** Zero or negative: how much the distance costs this user. */
  distance: number;
  score: number;
  tier: FeasibilityTier;
};

/** Points lost to distance. Free inside the comfortable range, then rising to
 *  the travel choice's full weight at the edge of the search radius. A place
 *  with no coordinates gets the midpoint — unknown, neither near nor far. */
export function distancePenalty(distanceM: number | null, travel: TravelWillingness): number {
  const { radius_m, comfortable_m, distance_weight } = TRAVEL_SEARCH[travel];
  if (distanceM === null) return distance_weight * 0.5;
  if (distanceM <= comfortable_m) return 0;
  return distance_weight * Math.min(1, (distanceM - comfortable_m) / (radius_m - comfortable_m));
}

export function assessFeasibility(candidate: PlaceCandidate, prefs: FeasibilityPrefs): Feasibility {
  const open = candidate.open_now === true ? FEASIBILITY.open_now : 0;
  const budget = budgetScore(prefs.meal_budget, candidate.price_level);
  const distance = -distancePenalty(candidate.distance_m, prefs.travel);
  const score = open + budget + distance;
  const tier: FeasibilityTier =
    score >= FEASIBILITY.strong_at ? "strong" : score <= FEASIBILITY.weak_at ? "weak" : "ok";
  return { open, budget, distance, score, tier };
}

export type Assessed = { candidate: PlaceCandidate; feasibility: Feasibility };

/** Most feasible first. Ties fall back to nearer, then id, so the order is
 *  fully deterministic. */
export function rankByFeasibility(candidates: readonly PlaceCandidate[], prefs: FeasibilityPrefs): Assessed[] {
  return candidates
    .map((candidate) => ({ candidate, feasibility: assessFeasibility(candidate, prefs) }))
    .sort(
      (a, b) =>
        b.feasibility.score - a.feasibility.score ||
        (a.candidate.distance_m ?? Infinity) - (b.candidate.distance_m ?? Infinity) ||
        a.candidate.id.localeCompare(b.candidate.id),
    );
}

/** What the model chooses from: up to SHORTLIST.size places, best feasibility
 *  first, with variety — not the deterministic top three. Weak places are held
 *  back only while SHORTLIST.min_non_weak others remain, so the result is never
 *  smaller than min(candidates, min_non_weak) (≥ 3): "exactly three when three
 *  or more exist" is decided by how many real places there are, not by this
 *  step. */
export function shortlistCandidates(candidates: readonly PlaceCandidate[], prefs: FeasibilityPrefs): PlaceCandidate[] {
  const ranked = rankByFeasibility(candidates, prefs);
  const viable = ranked.filter((a) => a.feasibility.tier !== "weak");
  const pool = viable.length >= SHORTLIST.min_non_weak ? viable : ranked;

  const picked: Assessed[] = [];
  const perType = new Map<string, number>();
  const typeOf = (a: Assessed) => a.candidate.primary_type ?? a.candidate.category ?? a.candidate.id;

  for (const item of pool) {
    if (picked.length >= SHORTLIST.size) break;
    const type = typeOf(item);
    if ((perType.get(type) ?? 0) >= SHORTLIST.max_per_type) continue;
    perType.set(type, (perType.get(type) ?? 0) + 1);
    picked.push(item);
  }
  // Too few different kinds to fill the list: backfill with the rest, in order.
  for (const item of pool) {
    if (picked.length >= SHORTLIST.size) break;
    if (!picked.includes(item)) picked.push(item);
  }

  return picked
    .sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b))
    .map((a) => a.candidate);
}
