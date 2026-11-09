// What a failed request says to a person. Never the raw server, Supabase or
// model message — those go to the console for whoever is debugging. Every
// state says what to do next.

import type { RecommendUiError, ViolationKind } from "@/lib/types";

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
const TRY = { retry: true, byType: false, change: false };
const CHANGE = { retry: false, byType: false, change: true };

// One message per real cause. Never a promise about how often a retry works (we
// don't know), never "couldn't find good options" for something that wasn't a
// search for options, and never a rule loosened to make a request succeed.
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
    body: "The places lookup didn't answer. Try again, or get food ideas by type.",
    ...NEARBY,
  },
  unauthenticated: {
    title: "You're signed out.",
    body: "Sign in again to get recommendations.",
    retry: false,
    byType: false,
    change: false,
  },
  rate_limited: { title: "The AI service is busy.", body: "It asked us to slow down. Wait a moment, then try again.", ...TRY },
  upstream_timeout: {
    title: "That took too long.",
    body: "The request timed out before a result came back. You can send it again.",
    ...TRY,
  },
  upstream_error: {
    title: "The AI service didn't answer properly.",
    body: "We couldn't get a usable response from the AI service. You can send the request again.",
    ...TRY,
  },
  network_error: {
    title: "Couldn't reach the server.",
    body: "Check your connection, then send the request again.",
    ...TRY,
  },
  bad_response: {
    title: "The server's reply couldn't be read.",
    body: "Something between you and the app answered with an error page instead of results. You can send the request again.",
    ...TRY,
  },
  malformed_output: {
    title: "The answer came back in a form we couldn't use.",
    body: "Every answer is checked before it's shown, and this one didn't pass. Nothing was shown. You can send the request again.",
    ...TRY,
  },
  truncated_output: {
    title: "The answer was cut off.",
    body: "The AI ran out of room before finishing, so nothing was shown. You can send the request again.",
    ...TRY,
  },
  constraint_violation: {
    title: "None of the options passed your rules.",
    body: "Every set is checked against your rules, and one option in this set broke one. We don't loosen those rules to get a result. You can try again, or change your answers.",
    retry: true,
    byType: false,
    change: true,
  },
  model_refused: {
    title: "The AI declined this request.",
    body: "It chose not to answer this one. Changing your answers may help.",
    ...CHANGE,
  },
  profile_unavailable: {
    title: "Couldn't load your food profile.",
    body: "We don't suggest meals without your allergies and equipment, so we stopped. You can send the request again.",
    ...TRY,
  },
  session_save_failed: {
    title: "The options couldn't be saved.",
    body: "They were made but not stored, and choosing or saving one depends on that — so none are shown. You can send the request again.",
    ...TRY,
  },
  llm_not_configured: {
    title: "Suggestions aren't set up on this server.",
    body: "This is a configuration problem, not something you did.",
    retry: false,
    byType: false,
    change: false,
  },
  daily_limit: {
    title: "You've reached today's limit.",
    body: "To keep this beta affordable, each person gets a set number of suggestions a day. It resets tomorrow.",
    retry: false,
    byType: false,
    change: false,
  },
  nearby_limit: {
    title: "You've used today's nearby searches.",
    body: "You can still get food ideas by type, or look again tomorrow.",
    ...NEARBY,
    retry: false,
  },
  usage_unavailable: { title: "Suggestions are paused for a moment.", body: "The daily allowance couldn't be checked, so nothing was started. Please try again shortly.", ...TRY },
  invalid_context: {
    title: "Something about those answers didn't work.",
    body: "Go back and check your answers, then try again.",
    ...CHANGE,
  },
};

// A code we have no specific words for. Say that plainly — and no more.
const FALLBACK: ErrorCopy = {
  title: "Something went wrong.",
  body: "No recommendations were made this time.",
  retry: true,
  byType: false,
  change: true,
};

/** What each broken rule is called to the person. */
const BROKEN: Record<ViolationKind, string> = {
  allergy: "an allergy you listed",
  diet: "your dietary pattern",
  equipment: "equipment you haven't said you have",
  no_cook: "heat or cooking when you can't, or don't want to, cook",
  time: "your time limit",
  budget: "your spending limit",
  inventory: "food you didn't say you have",
  ways: "a way of eating you ruled out",
};

/** "It broke: an allergy you listed; your time limit." — or null when nothing is known. */
export function brokenRules(reasons: readonly ViolationKind[] | undefined): string | null {
  const named = (reasons ?? []).map((r) => BROKEN[r]).filter(Boolean);
  return named.length > 0 ? `It broke: ${named.join("; ")}.` : null;
}

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
