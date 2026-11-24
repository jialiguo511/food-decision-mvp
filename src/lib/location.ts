// Browser geolocation for one nearby search. Client-side only, and only ever
// called from a click handler (never on page load or from an effect) — the
// permission prompt must follow an explicit "Find food near me" tap. The
// result is held in memory for that request and never stored: not in
// state that outlives the request, not in the Profile, not in localStorage.

import { isNativeApp } from "./native";
import type { LocationErrorCode, SearchLocation } from "./types";

/** In the iOS app the switch is in iOS Settings, not a browser's. */
export const APP_LOCATION_DENIED =
  "Location is off for this app, so we can't look for places near you. You can turn it on in iPhone Settings → What to Eat → Location, or get food ideas by type instead.";

export class LocationError extends Error {
  constructor(readonly code: LocationErrorCode) {
    super(code === "location_denied" && isNativeApp() ? APP_LOCATION_DENIED : LOCATION_MESSAGES[code]);
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

/** The native plugin's error codes (README of @capacitor/geolocation), mapped to ours. */
export function nativeLocationErrorCode(code: unknown): LocationErrorCode {
  if (code === "OS-PLUG-GLOC-0003" || code === "OS-PLUG-GLOC-0008") return "location_denied";
  if (code === "OS-PLUG-GLOC-0010") return "location_timeout";
  if (code === "OS-PLUG-GLOC-0007") return "location_unavailable";
  return "location_unavailable";
}

/** Inside the iOS app: ask iOS directly. The WebView's own geolocation remembers a "Don't Allow"
 *  for as long as the page is open, so someone who turned location on in Settings stayed stuck
 *  until they force-quit; the native plugin reads the current permission every time. */
async function requestNativeLocation(): Promise<SearchLocation> {
  const { Geolocation } = await import("@capacitor/geolocation");
  try {
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: OPTIONS.timeout, maximumAge: OPTIONS.maximumAge });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (error) {
    throw new LocationError(nativeLocationErrorCode((error as { code?: unknown })?.code));
  }
}

/** Asks for the current position (iOS app: natively; browser: navigator.geolocation). Rejects with
 *  a LocationError. Only ever called from a tap. */
export function requestLocation(
  geolocation?: Pick<Geolocation, "getCurrentPosition">,
): Promise<SearchLocation> {
  if (geolocation === undefined && isNativeApp()) return requestNativeLocation();
  return requestBrowserLocation(geolocation ?? (typeof navigator === "undefined" ? undefined : navigator.geolocation));
}

function requestBrowserLocation(geolocation: Pick<Geolocation, "getCurrentPosition"> | undefined): Promise<SearchLocation> {
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
