// Straight-line distance, computed deterministically from two coordinates.
// It is NOT walking or driving distance and is never presented as time —
// there is no routing data in v1.

import type { SearchLocation } from "../types";

const EARTH_RADIUS_M = 6_371_008.8;
const METERS_PER_MILE = 1609.344;

/** Great-circle (haversine) distance in meters. */
export function distanceMeters(a: SearchLocation, b: SearchLocation): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rounded so it reads (and is stored) as the approximation it is. */
export function roundDistance(meters: number): number {
  return Math.round(meters / 10) * 10;
}

/** "≈ 0.4 mi away" — labeled approximate, never a walking time. */
export function formatDistance(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.05) return "< 0.1 mi away";
  if (miles >= 10) return `≈ ${Math.round(miles)} mi away`;
  return `≈ ${miles.toFixed(1)} mi away`;
}
