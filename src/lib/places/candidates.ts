// Turns raw provider results into the candidate set the recommender chooses
// from: drops what should never be recommended, attaches deterministic
// distance, dedupes, and orders by distance. Pure and provider-agnostic —
// everything here works on NearbyPlace.

import type { SearchLocation } from "../types";
import { EXCLUDED_PRIMARY_TYPES, MAX_CANDIDATES } from "./config";
import { distanceMeters, roundDistance } from "./distance";
import type { NearbyPlace } from "./provider";

export type PlaceCandidate = NearbyPlace & {
  /** Approximate straight-line distance in meters (rounded), or null if the
   *  place has no coordinates. */
  distance_m: number | null;
  /** True when this user marked the place "not for me" softly (too expensive,
   *  other): it stays eligible but feasibility ranks it lower. */
  user_downranked?: boolean;
};

const EXCLUDED = new Set<string>(EXCLUDED_PRIMARY_TYPES);

export function buildCandidates(
  places: readonly NearbyPlace[],
  origin: SearchLocation,
  options: { excludeIds?: ReadonlySet<string>; downrankIds?: ReadonlySet<string>; max?: number } = {},
): PlaceCandidate[] {
  const withDistance = places
    .filter((p) => p.operational !== false) // closed temporarily or permanently
    .filter((p) => p.open_now !== false) // known closed right now
    .filter((p) => !(p.primary_type && EXCLUDED.has(p.primary_type)))
    .filter((p) => !options.excludeIds?.has(p.id))
    .map((p): PlaceCandidate => ({
      ...p,
      distance_m: p.location ? roundDistance(distanceMeters(origin, p.location)) : null,
      ...(options.downrankIds?.has(p.id) ? { user_downranked: true } : {}),
    }))
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));

  // By id first, then by name: two branches of one chain would otherwise fill
  // two of the three slots with what is, to the user, the same choice. The
  // list is distance-sorted, so the nearest branch is the one kept.
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const unique: PlaceCandidate[] = [];
  for (const place of withDistance) {
    const nameKey = place.name.toLowerCase();
    if (seenIds.has(place.id) || seenNames.has(nameKey)) continue;
    seenIds.add(place.id);
    seenNames.add(nameKey);
    unique.push(place);
  }
  return unique.slice(0, options.max ?? MAX_CANDIDATES);
}
