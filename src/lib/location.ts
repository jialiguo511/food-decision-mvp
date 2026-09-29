// Browser geolocation for one nearby search. Client-side only, and only ever
// called from a click handler (never on page load or from an effect) — the
// permission prompt must follow an explicit "Find food near me" tap. The
// result is held in memory for that request and never stored: not in
// state that outlives the request, not in the Profile, not in localStorage.

import type { LocationErrorCode, SearchLocation } from "./types";

export class LocationError extends Error {
  constructor(readonly code: LocationErrorCode) {
    super(LOCATION_MESSAGES[code]);
    this.name = "LocationError";
  }
}

/** User-facing copy for each way location can fail. Every one points at the
 *  category-based alternative, which needs no location. */
export const LOCATION_MESSAGES: Record<LocationErrorCode, string> = {
  location_unsupported: "This browser can't share your location. You can still get food ideas by type.",
  location_denied:
    "Location access is off, so we can't look for places near you. You can allow it in your browser settings, or get food ideas by type instead.",
  location_unavailable: "We couldn't work out where you are right now. Try again, or get food ideas by type instead.",
  location_timeout: "Finding your location took too long. Try again, or get food ideas by type instead.",
};

// A cached fix up to a minute old is fine for "nearby"; a coarse fix is fine
// too — this is not navigation, so no high-accuracy GPS wake-up.
const OPTIONS: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 };

/** Maps GeolocationPositionError.code (1 denied, 2 unavailable, 3 timeout). */
export function locationErrorCode(positionErrorCode: number): LocationErrorCode {
  if (positionErrorCode === 1) return "location_denied";
  if (positionErrorCode === 3) return "location_timeout";
  return "location_unavailable";
}

/** Asks the browser for the current position. Rejects with a LocationError. */
export function requestLocation(
  geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.geolocation,
): Promise<SearchLocation> {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new LocationError("location_unsupported"));
      return;
    }
    try {
      geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        (error) => reject(new LocationError(locationErrorCode(error.code))),
        OPTIONS,
      );
    } catch {
      reject(new LocationError("location_unsupported"));
    }
  });
}
