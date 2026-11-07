// What a failed request says to a person. Never the raw server, Supabase or
// model message — those go to the console for whoever is debugging. Every
// state says what to do next.

import type { RecommendUiError } from "@/lib/types";

export type ErrorCopy = {
  title: string;
  body: string;
  /** "Try again" can help. */
  retry: boolean;
  /** Offer food ideas by type (needs no location or places lookup). */
  byType: boolean;
  /** Offer going back to change the answers. */
  change: boolean;
};

const NEARBY = { retry: true, byType: true, change: false };

const COPY: Partial<Record<RecommendUiError["code"], ErrorCopy>> = {
  location_denied: {
    title: "We need your location to find nearby food.",
    body: "Allow location for this site in your browser settings, or get food ideas by type instead.",
    ...NEARBY,
  },
  location_unsupported: {
    title: "This browser can't share your location.",
    body: "You can still get food ideas by type.",
    ...NEARBY,
    retry: false,
  },
  location_unavailable: { title: "Couldn't work out where you are.", body: "Try again, or get food ideas by type instead.", ...NEARBY },
  location_timeout: { title: "Finding your location took too long.", body: "Try again, or get food ideas by type instead.", ...NEARBY },
  invalid_location: { title: "We didn't get your location.", body: "Try again, or get food ideas by type instead.", ...NEARBY },
  places_not_configured: {
    title: "Nearby search isn't available yet.",
    body: "You can still get food ideas by type.",
    ...NEARBY,
    retry: false,
  },
  places_unavailable: {
    title: "Couldn't look up places near you.",
    body: "Try again in a moment, or get food ideas by type.",
    ...NEARBY,
  },
  unauthenticated: {
    title: "You're signed out.",
    body: "Sign in again to get recommendations.",
    retry: false,
    byType: false,
    change: false,
  },
  rate_limited: { title: "Lots of requests right now.", body: "Give it a moment, then try again.", retry: true, byType: false, change: false },
  upstream_timeout: { title: "That took too long.", body: "Try again — it usually works on a second go.", retry: true, byType: false, change: false },
  invalid_context: {
    title: "Something about those answers didn't work.",
    body: "Go back and check your answers, then try again.",
    retry: false,
    byType: false,
    change: true,
  },
};

const FALLBACK: ErrorCopy = {
  title: "Couldn't find good options this time.",
  body: "Try again — it usually works on a second go.",
  retry: true,
  byType: false,
  change: true,
};

export function errorCopy(code: RecommendUiError["code"]): ErrorCopy {
  return COPY[code] ?? FALLBACK;
}

/** Messages the app itself writes for a person (e.g. from a Server Action),
 *  as opposed to a raw database or network message. */
const HUMAN_MESSAGES = ["You are signed out. Please sign in again."];

/** A Server Action's error, made safe to show: known human copy passes
 *  through; anything else is logged and replaced with `fallback`. */
export function friendlyActionError(raw: string, fallback: string): string {
  if (HUMAN_MESSAGES.includes(raw)) return raw;
  console.error("[home] action failed:", raw);
  return fallback;
}
