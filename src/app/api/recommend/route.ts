// POST /api/recommend — a MealContext (plus, only for "Show me 3 more", the
// previous recommendation set) in, exactly three new recommendations out.
// Every call inserts a new decision_sessions row; it never updates one.
//
// The Anthropic key is read here and nowhere else. It has no NEXT_PUBLIC_
// prefix, so Next.js never inlines it into browser code, and this file only
// ever runs on the server.

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { recommendRequestSchema, resolveRecommendationInput, toProfileInput } from "@/lib/recommend/input";
import { createClient } from "@/lib/supabase/server";
import type { RecommendErrorCode, RecommendFailure, RecommendSuccess } from "@/lib/types";
import { generateRecommendations } from "./claude";

// One attempt plus one retry, each capped by the client timeout below.
export const maxDuration = 200;

const STATUS: Record<RecommendErrorCode, number> = {
  llm_not_configured: 503,
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
  const { context, previous_recommendations } = parsedBody.data;

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

function fail(code: RecommendErrorCode, message: string, details?: string[]) {
  const body: RecommendFailure = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status: STATUS[code] });
}
