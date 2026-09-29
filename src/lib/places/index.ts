// Picks the places provider from the environment. Returns null when no key is
// configured so the route can say so plainly instead of failing obscurely.

import { createGooglePlacesProvider } from "./google";
import type { PlacesProvider } from "./provider";

export function resolvePlacesProvider(): PlacesProvider | null {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return apiKey ? createGooglePlacesProvider(apiKey) : null;
}
