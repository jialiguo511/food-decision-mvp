// POST /api/recommend — a MealContext (plus, only for "Show me 3 more", the
// previous recommendation set) in, exactly three new recommendations out.
// Every call inserts a new decision_sessions row; it never updates one.
//
// The Anthropic key is read here and nowhere else. It has no NEXT_PUBLIC_
// prefix, so Next.js never inlines it into browser code, and this file only
// ever runs on the server.
//
// Latency: the user waits only for what the cards need. Independent reads run
// together; every stage is timed (lib/timing.ts) and logged per request; and
// for "Find food near me" no model is on the critical path at all — the three
// places are picked by code the moment the Places search returns, and the model
// only adds wording afterwards (POST /api/recommend/enrich).

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { calculateNutritionTargets, targetsSignature } from "@/lib/nutrition";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import { buildCandidates } from "@/lib/places/candidates";
import { effectiveTravel, searchRadiusMeters } from "@/lib/places/travel";
import { resolvePlacesProvider } from "@/lib/places";
import { PlacesError } from "@/lib/places/provider";
import { toProfileFormValues } from "@/lib/profile";
import { loadBehaviorHints } from "@/lib/recommend/behaviorQuery";
import {
  recommendRequestSchema,
  resolveRecommendationInput,
  toProfileInput,
} from "@/lib/recommend/input";
import { pickNearby } from "@/lib/recommend/nearbyPicks";
import { withoutExcludedPlaces } from "@/lib/recommend/placeExclusions";
import { recordEvent } from "@/lib/events/record";
import { consumeUsage } from "@/lib/usage/consume";
import { createClient } from "@/lib/supabase/server";
import { createTimer, type Timer } from "@/lib/timing";
import { MAX_SHOWN_PLACES } from "@/lib/recommend/session";
import type {
  DecisionContext,
  Recommendation,
  RecommendErrorCode,
  RecommendFailure,
  RecommendNoMore,
  RecommendSuccess,
  SearchLocation,
} from "@/lib/types";
import { loadPlaceFeedback } from "@/lib/places/feedbackQuery";
import { loadSavedState } from "@/lib/saved/savedQuery";
import { generateRecommendations } from "./claude";

// Worst case: a model call (45 s) plus the SDK's transport retry (45 s), plus —
// only when the first answer came back fast but was rejected by our checks — one
// more call (claude.ts: RETRY_ONLY_IF_FIRST_UNDER_MS). A normal request is
// seconds; this is the ceiling, not the expectation.
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
  daily_limit: 429,
  nearby_limit: 429,
  usage_unavailable: 503,
};

const MODE_LABEL = { cook: "Cook", order: "Get food", store_snack: "Snack", open: "Open" } as const;

/** The browser tags each explicit submit with an id (X-Request-Id), so the
 *  client console and this terminal can be lined up: one tap should show one
 *  `received` line here, and at most one `model call`. Anything not shaped
 *  like an id is ignored rather than logged. */
function requestIdOf(request: Request): string | null {
  const raw = request.headers.get("x-request-id");
  return raw && /^[A-Za-z0-9_-]{1,40}$/.test(raw) ? raw : null;
}

/** What the request turned out to be, for its one product event — filled in as
 *  `handle` learns it. Modes and codes only; never answers, never a location. */
type Meta = {
  supabase?: Awaited<ReturnType<typeof createClient>>;
  userId?: string;
  mode?: "cook" | "order" | "store_snack" | "open";
  nearby?: boolean;
  entry?: "sentence" | "steps" | "again" | "more";
};

export async function POST(request: Request) {
  const requestId = requestIdOf(request);
  const timer = createTimer("recommend", undefined, requestId);
  console.info(`[recommend] received requestId=${requestId ?? "none"}`);
  const startedAt = Date.now();
  const meta: Meta = {};
  try {
    const response = await handle(request, timer, requestId, meta);
    await recordOutcome(meta, response, Date.now() - startedAt);
    return response;
  } finally {
    timer.report();
  }
}

/** One `recommend_done` event per request that got as far as a signed-in user
 *  and a readable mode: ok with how many cards, or the failure code. */
async function recordOutcome(meta: Meta, response: Response, ms: number) {
  if (!meta.supabase || !meta.userId || !meta.mode) return;
  let code: string | undefined;
  let count: number | undefined;
  if (response.status !== 200) {
    const body = (await response.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
    code = typeof body?.error?.code === "string" ? body.error.code : "unknown";
  } else {
    const body = (await response.clone().json().catch(() => null)) as { recommendations?: unknown[]; no_more?: boolean } | null;
    count = body?.no_more ? 0 : Array.isArray(body?.recommendations) ? Math.min(body.recommendations.length, 3) : undefined;
  }
  await recordEvent(meta.supabase, meta.userId, {
    name: "recommend_done",
    props: { mode: meta.mode, ...(meta.nearby ? { nearby: true } : {}), ...(meta.entry ? { entry: meta.entry } : {}), ok: response.status === 200, ...(code ? { code } : {}), ms: Math.min(ms, 600_000), ...(count !== undefined ? { count } : {}) },
  });
}

/** JSON with the timing table attached as a Server-Timing header, so the same
 *  numbers show in the browser's Network → Timing tab. */
function respond(timer: Timer, body: RecommendSuccess | RecommendNoMore | RecommendFailure, status = 200) {
  return NextResponse.json(body, { status, headers: { "Server-Timing": timer.header() } });
}

async function handle(request: Request, timer: Timer, requestId: string | null, meta: Meta) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await timer.stage("auth", () => supabase.auth.getUser());
  if (!user) return fail(timer, "unauthenticated", "You are signed out. Please sign in again.");
  meta.supabase = supabase;
  meta.userId = user.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(timer, "invalid_context", "Request body must be JSON.");
  }
  const parsedBody = recommendRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    return fail(
      timer,
      "invalid_context",
      "The meal context was incomplete or invalid.",
      parsedBody.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  const { context, previous_recommendations, location, entry, shown_place_ids } = parsedBody.data;
  meta.mode = context.decision_mode;
  meta.nearby = context.decision_mode === "order" && context.nearby === true;
  meta.entry = entry;
  timer.setLabel(
    context.decision_mode === "order" && context.nearby === true ? "Get food (nearby)" : MODE_LABEL[context.decision_mode],
  );
  console.info(`[recommend] mode requestId=${requestId ?? "none"} mode=${context.decision_mode}${context.decision_mode === "order" && context.nearby === true ? " (nearby)" : ""}`);

  // "Find food near me": the one request shape that also needs a Places key
  // and the user's location. Checked here — after auth, before any profile
  // read or provider call — so a missing key or location fails fast and
  // identically for every caller.
  const wantsNearby = context.decision_mode === "order" && context.nearby === true;
  const places = wantsNearby ? resolvePlacesProvider() : null;
  if (wantsNearby && !places) {
    return fail(timer, "places_not_configured", "Nearby search isn't set up yet: GOOGLE_PLACES_API_KEY is missing on the server.");
  }
  if (wantsNearby && !location) {
    return fail(timer, "invalid_location", "We didn't receive your location, so we can't look for places near you.");
  }

  // The daily allowance, spent BEFORE any paid call (the Places search, the
  // model). Counted whether or not the work succeeds, atomically in Postgres,
  // so a failed or concurrent request can't be used to get around it. A nearby
  // search is metered on its own as well, since Places is billed per search —
  // and is checked first, so being out of those still leaves food ideas by type.
  if (wantsNearby) {
    const nearbyUsage = await timer.stage("usage", () => consumeUsage(supabase, "nearby"));
    if (!nearbyUsage.allowed) return refuseUsage(timer, supabase, user.id, "nearby", nearbyUsage.reason);
  }
  const usage = await timer.stage("usage", () => consumeUsage(supabase, "recommend"));
  if (!usage.allowed) return refuseUsage(timer, supabase, user.id, "recommend", usage.reason);

  if (wantsNearby && context.decision_mode === "order" && places && location) {
    return handleNearby({ supabase, userId: user.id, places, context, location, previous: previous_recommendations, shown: shown_place_ids, signal: request.signal, timer });
  }

  // Every other mode needs the model, so a missing key is reported before any
  // database work.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail(timer, "llm_not_configured", "Recommendations aren't set up yet: ANTHROPIC_API_KEY is missing on the server.");
  }

  // Three independent reads, together. Allergies and equipment are hard
  // constraints (dislikes are soft): if the profile can't be read, recommending
  // from defaults could suggest something the user won't eat, so stop instead —
  // a missing row (never saved) is fine and uses defaults. Kitchen staples and
  // behavioral hints are soft, so a failure degrades to "none" rather than
  // failing the request. Staples are the ONLY persistent ingredient source —
  // see resolveRecommendationInput's canonical availability rule.
  const [profileResult, staplesResult, behavioralHints] = await timer.stage("preferences", () =>
    Promise.all([
      timer.part("preferences", "profile", async () =>
        // Every column, not a fixed list: a database that hasn't yet run the
        // Profile v2 migration must not make recommendations fail on a missing
        // column — absent fields simply read as "not set" (see lib/profile.ts).
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      ),
      // Kitchen staples feed any request that can include a recipe.
      context.decision_mode === "cook" || (context.decision_mode === "open" && context.ways.cook)
        ? timer.part("preferences", "staples", async () => supabase.from("kitchen_staples").select("name").eq("user_id", user.id))
        : Promise.resolve(null),
      // Behavioral hints are per mode; a cross-way request has no single mode to read them from.
      context.decision_mode === "open"
        ? Promise.resolve(null)
        : timer.part("preferences", "hints", () => loadBehaviorHints(supabase, user.id, context.decision_mode)),
    ]),
  );
  if (profileResult.error) {
    console.error("[recommend] profile read failed", profileResult.error);
    return fail(timer, "profile_unavailable", "Couldn't load your food profile.");
  }
  if (staplesResult?.error) console.error("[recommend] kitchen staples read failed", staplesResult.error);
  const kitchenStaples = (staplesResult?.data ?? []).map((r) => r.name as string);

  const input = resolveRecommendationInput(
    toProfileInput(profileResult.data),
    context,
    previous_recommendations,
    kitchenStaples,
    behavioralHints,
  );

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
      timer,
      "invalid_context",
      "You haven't told us what you have yet. Add a few things above, or switch to \"I can buy a few things\".",
    );
  }

  // Every HTTP attempt to Anthropic is logged with the request id: this is the
  // authoritative count of paid model calls (the SDK retries a transient
  // failure once, which shows up here as attempt=2).
  let attempts = 0;
  const client = new Anthropic({
    apiKey,
    // A normal call is seconds (tens at the very slowest setting). A call that
    // has been silent this long is hung, and the user is watching a spinner —
    // fail it, let the SDK's single transport retry run, and bound the worst
    // case well under maxDuration instead of waiting minutes.
    timeout: 45_000,
    maxRetries: 1,
    fetch: (url, init) => {
      attempts++;
      console.info(`[recommend] model call requestId=${requestId ?? "none"} attempt=${attempts}`);
      return fetch(url, init);
    },
  });
  // The browser went away on purpose (the user changed their answers): stop the
  // model call too instead of paying for an answer nobody will read.
  const result = await generateRecommendations(client, input, [], timer, { signal: request.signal });
  if (!result.ok) return fail(timer, result.code, result.message, result.details);

  const targets = nutritionTargetsOf(profileResult.data);
  return persistAndRespond({
    supabase,
    userId: user.id,
    context,
    recommendations: result.recommendations,
    extra: {
      insufficient_inventory: result.insufficientInventory,
      constraints: input.hard_constraints,
      model: result.model,
      ...(targets.personalized ? { targets_sig: targetsSignature(targets) } : {}),
    },
    timer,
  });
}

/** A paid call refused for today (or held back because the allowance couldn't
 *  be checked). The limit event is a note, not part of the answer. */
function refuseUsage(timer: Timer, supabase: ServerSupabase, userId: string, kind: "recommend" | "nearby", reason: "limit" | "unavailable") {
  if (reason === "unavailable") return fail(timer, "usage_unavailable", "Suggestions are paused for a moment. Please try again shortly.");
  void recordEvent(supabase, userId, { name: "limit_hit", props: { kind } });
  return kind === "nearby"
    ? fail(timer, "nearby_limit", "You've used today's nearby searches.")
    : fail(timer, "daily_limit", "You've reached today's limit for suggestions.");
}

function nutritionTargetsOf(profileRow: unknown) {
  return calculateNutritionTargets(toProfileFormValues(profileRow), DEFAULT_PROTEIN_TARGET_G);
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/** Stored so a later "Choose this" or Save can address this exact set, without
 *  re-sending the recommendations from the client — so the row must exist
 *  before the cards do. The "which of these are already saved" read doesn't
 *  depend on the insert, so the two run together. */
async function persistAndRespond(args: {
  supabase: ServerSupabase;
  userId: string;
  context: DecisionContext;
  /** What to store as the row's context, when it holds more than the answers
   *  (nearby: the places shown so far). Defaults to `context`. */
  storedContext?: Record<string, unknown>;
  recommendations: Recommendation[];
  extra: Pick<RecommendSuccess, "insufficient_inventory" | "constraints" | "model"> & Partial<Pick<RecommendSuccess, "targets_sig" | "enrichment_pending" | "shown_place_ids">>;
  timer: Timer;
}) {
  const { supabase, userId, context, storedContext, recommendations, extra, timer } = args;
  const [{ data: session, error: sessionError }, saved] = await timer.stage("session_write", () => Promise.all([
    timer.part("session_write", "persist", async () =>
      supabase.from("decision_sessions").insert({ user_id: userId, context: storedContext ?? context, recommendations }).select("id").single(),
    ),
    timer.part("session_write", "saved_state", () => loadSavedState(supabase, userId, recommendations)),
  ]));
  if (sessionError || !session) {
    console.error("[recommend] session save failed", {
      operation: "insert decision_sessions",
      code: sessionError?.code,
      message: sessionError?.message,
    });
    return fail(timer, "session_save_failed", "Recommendations were generated but couldn't be saved. Please try again.");
  }

  const payload: RecommendSuccess = {
    recommendations,
    nutrition_is_estimate: true,
    session_id: session.id,
    saved,
    ...extra,
  };
  return respond(timer, payload);
}

/**
 * The nearby pipeline:
 *
 *   coordinates → Places search (server-side, narrow field mask)
 *     → filter + distance + dedupe → candidates (≤ 20 real places)
 *     → drop places that centre on an allergen / the dietary pattern
 *     → three picked by code (nearbyPicks.ts: open now, distance, price,
 *       the user's own feedback, a soft craving fit)
 *     → stored in decision_sessions and returned — no model yet.
 *
 * The model's part (the "why" and "what to look for" wording) happens after the
 * cards are on screen, in /api/recommend/enrich, so a slow model can't hold the
 * places back and a failed one can't remove them.
 *
 * The coordinates live only in this function's arguments: they are rounded,
 * used for the search and the distance math, and never stored or logged —
 * the session row gets `context.nearby: true` and the recommendations, which
 * carry only approximate distances to the places.
 */
async function handleNearby(args: {
  supabase: ServerSupabase;
  userId: string;
  places: NonNullable<ReturnType<typeof resolvePlacesProvider>>;
  context: Extract<DecisionContext, { decision_mode: "order" }>;
  location: SearchLocation;
  previous: Recommendation[] | undefined;
  /** Every place shown so far in this decision (see RecommendSuccess.shown_place_ids). */
  shown: string[] | undefined;
  /** The browser's own signal: it goes away when the user moves on. */
  signal: AbortSignal;
  timer: Timer;
}) {
  const { supabase, userId, places, context, previous, shown, signal, timer } = args;
  // ~11 m precision is far finer than the search radius needs.
  const origin: SearchLocation = {
    latitude: Math.round(args.location.latitude * 1e4) / 1e4,
    longitude: Math.round(args.location.longitude * 1e4) / 1e4,
  };
  const radius = searchRadiusMeters(context);

  // The search needs only the coordinates and the travel choice, so it runs
  // alongside the profile and the user's own place feedback instead of after.
  const [profileResult, searchResult, placeFeedback] = await timer.stage("places_and_profile", () => Promise.all([
    timer.part("places_and_profile", "profile", async () => supabase.from("profiles").select("*").eq("id", userId).maybeSingle()),
    timer.part("places_and_profile", "places", async () => {
      try {
        return { ok: true as const, found: await places.searchNearby({ location: origin, radius_m: radius }) };
      } catch (error) {
        // Provider detail (HTTP status, Google's error text) is for us, not the
        // user. Nothing logged here contains coordinates.
        console.error("[places] search failed", error instanceof PlacesError ? error.detail : error);
        return { ok: false as const };
      }
    }),
    timer.part("places_and_profile", "feedback", () => loadPlaceFeedback(supabase, userId)),
  ]));
  if (profileResult.error) {
    console.error("[recommend] profile read failed", profileResult.error);
    return fail(timer, "profile_unavailable", "Couldn't load your food profile.");
  }
  if (!searchResult.ok) return fail(timer, "places_unavailable", "Couldn't look up places near you right now.");
  const profile = toProfileInput(profileResult.data);

  // "Show me 3 more" never repeats a place from ANY earlier batch of this
  // decision. The browser sends the whole shown list; the last batch it sends
  // as `previous` is added too, so a page that only knows the last batch still
  // excludes that one. Being shown is NOT a dislike: nothing here is written as
  // feedback, and a fresh question (no list sent) starts again from nothing.
  const alreadyShown = new Set([...(shown ?? []), ...(previous ?? []).flatMap((r) => (r.decision_mode === "nearby" ? [r.place_id] : []))]);
  // This user's own "not for me" feedback, by provider place id. Excluded
  // places never become candidates (and so can't be picked); downranked ones
  // stay eligible and are scored lower in feasibility.
  const rank = timer.stage("rank", () => {
    const candidates = buildCandidates(searchResult.found, origin, {
      excludeIds: new Set([...alreadyShown, ...placeFeedback.excluded]),
      downrankIds: placeFeedback.downranked,
    });
    // Hard constraints first: a place that centres on an allergen or what the
    // dietary pattern excludes is never eligible. See placeExclusions.ts.
    const eligible = withoutExcludedPlaces(candidates, profile);
    const picks = pickNearby(eligible, {
      meal_budget: context.meal_budget,
      travel: effectiveTravel(context),
      craving_category: context.craving_category,
      craving_note: context.craving_note,
    });
    return { candidates, eligible, picks };
  });
  const { candidates, eligible, picks } = await rank;
  console.info("[places] search", {
    radius_m: radius,
    returned: searchResult.found.length,
    candidates: candidates.length,
    eligible: eligible.length,
    picked: picks.length,
    excluded_as_already_shown: alreadyShown.size,
  });

  // The user moved on (changed an answer, left) while Places was answering:
  // writing now could make THIS older request the newest stored session, and a
  // reload would restore it over the newer one. Store nothing.
  if (signal.aborted) return fail(timer, "upstream_error", "The request was cancelled.");

  // "More" with nothing new left: not a failure and not an empty set. Keep what
  // is on screen (nothing is stored), say so, and do NOT widen the search to
  // find something — that is the user's decision, offered as a button.
  if (alreadyShown.size > 0 && picks.length === 0) {
    return respond(timer, { no_more: true, shown_place_ids: [...alreadyShown].slice(0, MAX_SHOWN_PLACES) });
  }

  // Everything shown in this decision, stored beside the context so a reload can
  // carry on from it, and returned so the browser can send it with the next "more".
  const shownNow = [...new Set([...alreadyShown, ...picks.flatMap((r) => (r.decision_mode === "nearby" ? [r.place_id] : []))])].slice(0, MAX_SHOWN_PLACES);
  return persistAndRespond({
    supabase,
    userId,
    context,
    storedContext: { ...context, shown_place_ids: shownNow },
    recommendations: picks,
    extra: {
      insufficient_inventory: false,
      constraints: { decision_mode: "nearby", allergies: profile.allergies, dietary: { patterns: profile.dietary_patterns, other: profile.dietary_other } },
      model: "rules",
      shown_place_ids: shownNow,
      // Nothing real to choose from is a valid, honest result — and then there
      // is nothing for a model to write about.
      ...(picks.length > 0 ? { enrichment_pending: true } : {}),
    },
    timer,
  });
}

function fail(timer: Timer, code: RecommendErrorCode, message: string, details?: string[]) {
  const body: RecommendFailure = { error: { code, message, ...(details ? { details } : {}) } };
  // One line per failure, greppable by the id the browser shows next to the error:
  // which request, which code, which HTTP status, how far it got and how long each
  // stage took. Names, codes and milliseconds only — no answers, no profile, no keys,
  // no model output.
  const stages = timer.stages();
  console.warn("[recommend] failed", {
    requestId: timer.requestId() ?? "none",
    code,
    status: STATUS[code],
    last_stage: Object.keys(stages).at(-1) ?? "start",
    stages,
    total_ms: timer.elapsed(),
  });
  return respond(timer, body, STATUS[code]);
}
