// POST /api/recommend — a MealContext (plus, only for "Show me 3 more", the
// previous recommendation set) in, exactly three new recommendations out.
// Every call inserts a new decision_sessions row; it never updates one.
//
// The Anthropic key is read here and nowhere else. It has no NEXT_PUBLIC_
// prefix, so Next.js never inlines it into browser code, and this file only
// ever runs on the server.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { buildCandidates } from "@/lib/places/candidates";
import { effectiveTravel, searchRadiusMeters } from "@/lib/places/travel";
import { resolvePlacesProvider } from "@/lib/places";
import { PlacesError } from "@/lib/places/provider";
import { shortlistCandidates } from "@/lib/recommend/feasibility";
import {
  recommendRequestSchema,
  resolveNearbyInput,
  resolveRecommendationInput,
  toProfileInput,
} from "@/lib/recommend/input";
import { createClient } from "@/lib/supabase/server";
import type {
  DecisionContext,
  Recommendation,
  RecommendErrorCode,
  RecommendFailure,
  RecommendSuccess,
  SearchLocation,
} from "@/lib/types";
import { generateRecommendations } from "./claude";

// One attempt plus one retry, each capped by the client timeout below.
export const maxDuration = 200;

const STATUS: Record<RecommendErrorCode, number> = {
  llm_not_configured: 503,
  places_not_configured: 503,
  places_unavailable: 502,
  invalid_location: 400,
  unauthenticated: 401,
  invalid_context: 400,
  profile_unavailable: 500,
  malformed_output: 502,
  constraint_violation: 502,
  model_refused: 502,
  truncated_output: 502,
  rate_limited: 429,
  upstream_timeout: 504,
  upstream_error: 502,
  session_save_failed: 500,
};

export async function POST(request: Request) {
  // A missing key is a deployment problem, identical for every caller, so it is
  // reported first and before any database work.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail("llm_not_configured", "Recommendations aren't set up yet: ANTHROPIC_API_KEY is missing on the server.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", "You are signed out. Please sign in again.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("invalid_context", "Request body must be JSON.");
  }
  const parsedBody = recommendRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return fail(
      "invalid_context",
      "The meal context was incomplete or invalid.",
      parsedBody.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  const { context, previous_recommendations, location } = parsedBody.data;

  // "Find food near me": the one request shape that also needs a Places key
  // and the user's location. Checked here — after auth, before any profile
  // read or provider call — so a missing key or location fails fast and
  // identically for every caller.
  const wantsNearby = context.decision_mode === "order" && context.nearby === true;
  const places = wantsNearby ? resolvePlacesProvider() : null;
  if (wantsNearby && !places) {
    return fail("places_not_configured", "Nearby search isn't set up yet: GOOGLE_PLACES_API_KEY is missing on the server.");
  }
  if (wantsNearby && !location) {
    return fail("invalid_location", "We didn't receive your location, so we can't look for places near you.");
  }

  // Dislikes and equipment are hard constraints. If the profile can't be read,
  // recommending from defaults could suggest something the user won't eat, so
  // stop instead. A missing row (never saved) is fine and uses defaults.
  const { data: row, error } = await supabase
    .from("profiles")
    .select("goal, protein_target_g, daily_calorie_target_kcal, budget_per_meal_usd, fridge_size, default_cook_minutes, cuisines, dislikes, equipment")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[recommend] profile read failed", error);
    return fail("profile_unavailable", "Couldn't load your food profile.");
  }

  if (wantsNearby && context.decision_mode === "order" && places && location) {
    return handleNearby({
      supabase,
      userId: user.id,
      apiKey,
      places,
      context,
      location,
      previous: previous_recommendations,
      profileRow: row,
    });
  }

  // Kitchen staples are a soft preference (condiments/seasonings the user
  // generally has, not a hard constraint the way dislikes/equipment are), so
  // unlike the profile read above, a failure here degrades to "no staples"
  // rather than failing the whole request. This is the ONLY persistent
  // ingredient source — see resolveRecommendationInput's canonical
  // availability rule. Today's own foods (context.ingredients_on_hand) are
  // never persisted and never read back from an earlier session.
  const { data: staplesRows, error: staplesError } = await supabase
    .from("kitchen_staples")
    .select("name")
    .eq("user_id", user.id);
  if (staplesError) console.error("[recommend] kitchen staples read failed", staplesError);
  const kitchenStaples = (staplesRows ?? []).map((r) => r.name as string);

  const input = resolveRecommendationInput(toProfileInput(row), context, previous_recommendations, kitchenStaples);

  // Strict "Use what I have" with nothing entered for tonight: there is no
  // honest meal to suggest, and asking the model anyway is what invites
  // invented ingredients. Checked against context.ingredients_on_hand — what
  // the user typed for tonight — not the merged soft_preferences list, since
  // Kitchen staples alone (condiments only) can never make a meal either.
  if (
    context.decision_mode === "cook" &&
    context.shopping === "inventory_only" &&
    context.ingredients_on_hand.length === 0
  ) {
    return fail(
      "invalid_context",
      "You haven't told us what you have yet. Add a few things above, or switch to \"I can buy a few things\".",
    );
  }

  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  const result = await generateRecommendations(client, input);
  if (!result.ok) return fail(result.code, result.message, result.details);

  // Stored so a later "Choose this" can write chosen_index back onto this
  // exact set, without re-sending the recommendations from the client.
  const { data: session, error: sessionError } = await supabase
    .from("decision_sessions")
    .insert({
      user_id: user.id,
      context,
      recommendations: result.recommendations,
    })
    .select("id")
    .single();
  if (sessionError || !session) {
    console.error("[recommend] session save failed", sessionError);
    return fail("session_save_failed", "Recommendations were generated but couldn't be saved. Please try again.");
  }

  const payload: RecommendSuccess = {
    recommendations: result.recommendations,
    insufficient_inventory: result.insufficientInventory,
    nutrition_is_estimate: true,
    constraints: input.hard_constraints,
    model: result.model,
    session_id: session.id,
  };
  return NextResponse.json(payload);
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The nearby pipeline, on top of the same profile / prompt / validation /
 * session machinery the other modes use:
 *
 *   coordinates → Places search (server-side, narrow field mask)
 *     → filter + distance + dedupe → candidate set (≤ 20 real places)
 *     → existing recommender picks up to 3 BY place_id
 *     → output validated against that exact candidate set
 *     → stored in decision_sessions like any other recommendation set.
 *
 * The coordinates live only in this function's arguments: they are rounded,
 * used for the search and the distance math, and never stored or logged —
 * the session row gets `context.nearby: true` and the recommendations, which
 * carry only approximate distances to the places.
 */
async function handleNearby(args: {
  supabase: ServerSupabase;
  userId: string;
  apiKey: string;
  places: NonNullable<ReturnType<typeof resolvePlacesProvider>>;
  context: Extract<DecisionContext, { decision_mode: "order" }>;
  location: SearchLocation;
  previous: Recommendation[] | undefined;
  profileRow: unknown;
}) {
  const { supabase, userId, apiKey, places, context, previous, profileRow } = args;
  // ~11 m precision is far finer than the search radius needs.
  const origin: SearchLocation = {
    latitude: Math.round(args.location.latitude * 1e4) / 1e4,
    longitude: Math.round(args.location.longitude * 1e4) / 1e4,
  };

  // The search radius comes from "How far would you go?" (Eat nearby only;
  // every other method uses the moderate default) — see TRAVEL_SEARCH.
  const radius = searchRadiusMeters(context);
  const startedAt = Date.now();
  let found;
  try {
    found = await places.searchNearby({ location: origin, radius_m: radius });
  } catch (error) {
    // Provider detail (HTTP status, Google's error text) is for us, not the
    // user. Nothing logged here contains coordinates.
    console.error("[places] search failed", error instanceof PlacesError ? error.detail : error);
    return fail("places_unavailable", "Couldn't look up places near you right now.");
  }

  // "Show me 3 more" never repeats a place the user just saw.
  const alreadyShown = new Set(
    (previous ?? []).flatMap((r) => (r.decision_mode === "nearby" ? [r.place_id] : [])),
  );
  const candidates = buildCandidates(found, origin, { excludeIds: alreadyShown });
  // Deterministic feasibility (open now, distance, price vs. meal budget)
  // narrows the candidates to a diverse shortlist; the model ranks that.
  const shortlist = shortlistCandidates(candidates, { meal_budget: context.meal_budget, travel: effectiveTravel(context) });
  console.info("[places] search", {
    radius_m: radius,
    returned: found.length,
    candidates: candidates.length,
    shortlisted: shortlist.length,
    excluded_as_already_shown: alreadyShown.size,
    duration_ms: Date.now() - startedAt,
  });

  let recommendations: RecommendSuccess["recommendations"] = [];
  let model = "none";
  // Nothing real to choose from is a valid, honest result — and there is
  // nothing for the model to rank, so it isn't asked.
  if (shortlist.length > 0) {
    const input = resolveNearbyInput(toProfileInput(profileRow), context, shortlist);
    const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
    const result = await generateRecommendations(client, input, shortlist);
    if (!result.ok) return fail(result.code, result.message, result.details);
    recommendations = result.recommendations;
    model = result.model;
  }

  const { data: session, error: sessionError } = await supabase
    .from("decision_sessions")
    .insert({ user_id: userId, context, recommendations })
    .select("id")
    .single();
  if (sessionError || !session) {
    console.error("[recommend] session save failed", sessionError);
    return fail("session_save_failed", "Recommendations were generated but couldn't be saved. Please try again.");
  }

  const payload: RecommendSuccess = {
    recommendations,
    insufficient_inventory: false,
    nutrition_is_estimate: true,
    constraints: { decision_mode: "nearby" },
    model,
    session_id: session.id,
  };
  return NextResponse.json(payload);
}

function fail(code: RecommendErrorCode, message: string, details?: string[]) {
  const body: RecommendFailure = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status: STATUS[code] });
}
