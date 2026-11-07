// Google Places API (New) — Nearby Search — behind the PlacesProvider
// interface. Server-only: the key is passed in by the caller (route.ts reads
// GOOGLE_PLACES_API_KEY, which has no NEXT_PUBLIC_ prefix) and never leaves
// this process.
//
// Docs: https://developers.google.com/maps/documentation/places/web-service/nearby-search
// This is the current "Places API (New)" (POST places.googleapis.com/v1/...),
// not the legacy /maps/api/place endpoints.

import type { PlacePriceLevel } from "../types";
import {
  EXCLUDED_PRIMARY_TYPES,
  INCLUDED_TYPES,
  NEARBY_MAX_RESULTS,
  PLACES_FIELD_MASK,
  PLACES_TIMEOUT_MS,
} from "./config";
import { type NearbyPlace, PlacesError, type PlacesProvider, type PlacesSearchParams } from "./provider";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby";

/** Maps `PRICE_LEVEL_*` enum values. PRICE_LEVEL_UNSPECIFIED and anything
 *  unrecognized map to null: "we don't know" is never turned into a price. */
const PRICE_LEVELS: Record<string, PlacePriceLevel> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "inexpensive",
  PRICE_LEVEL_MODERATE: "moderate",
  PRICE_LEVEL_EXPENSIVE: "expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "very_expensive",
};

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export function createGooglePlacesProvider(apiKey: string, fetchImpl: FetchLike = fetch): PlacesProvider {
  return {
    async searchNearby({ location, radius_m }: PlacesSearchParams): Promise<NearbyPlace[]> {
      let response: Response;
      try {
        response = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
          },
          body: JSON.stringify({
            includedTypes: INCLUDED_TYPES,
            excludedPrimaryTypes: EXCLUDED_PRIMARY_TYPES,
            maxResultCount: NEARBY_MAX_RESULTS,
            // Popular first, so the 20 we get are places people actually
            // eat at, not the 20 nearest of anything.
            rankPreference: "POPULARITY",
            languageCode: "en",
            locationRestriction: {
              circle: { center: { latitude: location.latitude, longitude: location.longitude }, radius: radius_m },
            },
          }),
          signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
        });
      } catch (error) {
        // Network failure or timeout. The message never contains the request
        // body, so it can't leak coordinates.
        throw new PlacesError("request_failed", error instanceof Error ? error.name : "network error");
      }

      if (!response.ok) {
        throw new PlacesError("request_failed", await describeFailure(response));
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new PlacesError("request_failed", "response was not JSON");
      }
      // No matches is `{}` with no `places` key — valid, not an error.
      const raw = isRecord(body) && Array.isArray(body.places) ? body.places : [];
      return raw.flatMap((item) => {
        const place = normalizeGooglePlace(item);
        return place ? [place] : [];
      });
    },
  };
}

/** One raw Google place → the product's NearbyPlace, or null when it lacks
 *  what we can't work without (an id and a name). Everything else degrades
 *  to null rather than being guessed. */
export function normalizeGooglePlace(raw: unknown): NearbyPlace | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = cleanText(isRecord(raw.displayName) ? raw.displayName.text : null, 100);
  if (!id || !name) return null;

  const primaryType = typeof raw.primaryType === "string" && raw.primaryType ? raw.primaryType : null;
  const category =
    cleanText(isRecord(raw.primaryTypeDisplayName) ? raw.primaryTypeDisplayName.text : null, 60) ??
    (primaryType ? humanizeType(primaryType) : null);

  const loc = isRecord(raw.location) ? raw.location : null;
  const location =
    loc && isCoordinate(loc.latitude, 90) && isCoordinate(loc.longitude, 180)
      ? { latitude: loc.latitude, longitude: loc.longitude }
      : null;

  const status = typeof raw.businessStatus === "string" ? raw.businessStatus : null;
  const operational = status === null || status === "BUSINESS_STATUS_UNSPECIFIED" ? null : status === "OPERATIONAL";

  const hours = isRecord(raw.currentOpeningHours) ? raw.currentOpeningHours : null;
  const openNow = hours && typeof hours.openNow === "boolean" ? hours.openNow : null;

  return {
    id,
    name,
    category,
    primary_type: primaryType,
    address: cleanText(raw.shortFormattedAddress, 120),
    location,
    operational,
    open_now: openNow,
    price_level: typeof raw.priceLevel === "string" ? (PRICE_LEVELS[raw.priceLevel] ?? null) : null,
    maps_url: mapsUrl(id, name, raw.googleMapsUri),
    website_url: websiteUrl(raw.websiteUri),
    ...firstPhoto(raw.photos),
  };
}

/** The first photo's reference and credit. Only a reference of the exact form
 *  `places/<id>/photos/<ref>` is kept — it becomes part of a request path later,
 *  so anything else is "no photo". */
function firstPhoto(photos: unknown): { photo_name: string | null; photo_author: string | null } {
  const first = Array.isArray(photos) && isRecord(photos[0]) ? photos[0] : null;
  const name = first && typeof first.name === "string" && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(first.name) ? first.name : null;
  if (!name) return { photo_name: null, photo_author: null };
  const attributions = isRecord(first) && Array.isArray(first.authorAttributions) ? first.authorAttributions : [];
  const author = isRecord(attributions[0]) ? cleanText(attributions[0].displayName, 60) : null;
  return { photo_name: name, photo_author: author };
}

/** The place's own site, only when it parses as http(s). Anything else
 *  (missing, malformed, javascript:, a bare string) is "no website". */
function websiteUrl(websiteUri: unknown): string | null {
  if (typeof websiteUri !== "string" || websiteUri.length > 500) return null;
  try {
    const url = new URL(websiteUri);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Google's own link when it's a real https URL; otherwise the documented
 *  Maps URLs form, which opens the exact place by id. */
function mapsUrl(id: string, name: string, googleMapsUri: unknown): string {
  if (typeof googleMapsUri === "string") {
    try {
      const url = new URL(googleMapsUri);
      if (url.protocol === "https:") return url.toString();
    } catch {
      // fall through to the constructed link
    }
  }
  const params = new URLSearchParams({ api: "1", query: name, query_place_id: id });
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/** Third-party text ends up in the model prompt and on screen: collapse
 *  whitespace/control characters (a newline in a business name is how you'd
 *  smuggle a fake instruction line) and bound the length. */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned || null;
}

/** "mediterranean_restaurant" → "Mediterranean restaurant". */
function humanizeType(type: string): string {
  const text = type.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

/** Google's error body is `{ error: { status, message } }`. Status and
 *  Google's own message are safe for logs (the message doesn't echo the
 *  request body); the user never sees either. */
async function describeFailure(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body.error)) {
      const status = typeof body.error.status === "string" ? body.error.status : "";
      const message = typeof body.error.message === "string" ? body.error.message.slice(0, 200) : "";
      return `HTTP ${response.status} ${status} ${message}`.trim();
    }
  } catch {
    // not JSON — the status alone is enough
  }
  return `HTTP ${response.status}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
