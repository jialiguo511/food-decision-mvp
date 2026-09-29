// The seam between "real places near me" and the rest of the app. The
// recommender only ever sees NearbyPlace — the product's own minimal shape —
// never a vendor's raw response, so the provider can be replaced (see
// PRODUCT.md → "External integrations"). Google Places API (New) is the first
// implementation, in google.ts. Same pattern as ImageProvider.

import type { PlacePriceLevel, SearchLocation } from "../types";

export type NearbyPlace = {
  /** The provider's stable id for the place. The model refers to places by
   *  this and nothing else. */
  id: string;
  name: string;
  /** Short human label, e.g. "Mediterranean restaurant". */
  category: string | null;
  /** The provider's primary type id, e.g. "mediterranean_restaurant". */
  primary_type: string | null;
  address: string | null;
  location: SearchLocation | null;
  /** false only when the provider says the place is closed (temporarily or
   *  permanently); null = unknown. */
  operational: boolean | null;
  /** From the provider's current opening hours; null = unknown. */
  open_now: boolean | null;
  price_level: PlacePriceLevel | null;
  /** https link that opens this place in Google Maps. */
  maps_url: string;
};

export type PlacesSearchParams = {
  location: SearchLocation;
  radius_m: number;
};

export interface PlacesProvider {
  /** Nearby food places, unfiltered beyond what the provider itself does. */
  searchNearby(params: PlacesSearchParams): Promise<NearbyPlace[]>;
}

/** A provider failure with the detail kept out of anything user-facing. The
 *  route maps `code` to a friendly message; `detail` goes to server logs. */
export class PlacesError extends Error {
  constructor(
    readonly code: "not_configured" | "request_failed",
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "PlacesError";
  }
}
