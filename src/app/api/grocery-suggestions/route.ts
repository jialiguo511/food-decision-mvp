// POST /api/grocery-suggestions — no body, 3-5 "what to buy next" suggestions
// out. Deliberately separate from /api/recommend: this is not a meal
// recommendation (no decision_sessions row, no selection/feedback loop, not
// "exactly 3") — see src/lib/groceryHelper.ts.
//
// The Anthropic key is read here and nowhere else for this route, same rule
// as /api/recommend/route.ts.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NextResponse } from "next/server";
import { RECOMMEND_MODEL } from "@/app/api/recommend/claude";
import {
  buildGrocerySystemPrompt,
  buildGroceryUserMessage,
  grocerySuggestionsOutputSchema,
  parseGrocerySuggestions,
  type GroceryHelperInput,
} from "@/lib/groceryHelper";
import { DEFAULT_PROFILE, FRIDGE_SIZES, GOALS } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import type { RecommendErrorCode, RecommendFailure } from "@/lib/types";

export const maxDuration = 60;

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

export type GrocerySuggestionsSuccess = {
  suggestions: { name: string; reason: string }[];
  model: string;
};

export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return fail("llm_not_configured", "Grocery suggestions aren't set up yet: ANTHROPIC_API_KEY is missing on the server.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("unauthenticated", "You are signed out. Please sign in again.");

  const { data: row, error: profileError } = await supabase
    .from("profiles")
    .select("goal, protein_target_g, dislikes, cuisines, fridge_size")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("[grocery-suggestions] profile read failed", profileError);
    return fail("profile_unavailable", "Couldn't load your food profile.");
  }

  const { data: pantryRows, error: pantryError } = await supabase
    .from("pantry_items")
    .select("name")
    .eq("user_id", user.id);
  if (pantryError) console.error("[grocery-suggestions] pantry read failed", pantryError);
  const pantryItems = (pantryRows ?? []).map((r) => r.name as string);

  const goal = pick(row?.goal, GOALS.map((g) => g.value), DEFAULT_PROFILE.goal);
  const fridgeSize = pick(row?.fridge_size, FRIDGE_SIZES.map((f) => f.value), DEFAULT_PROFILE.fridge_size);
  const input: GroceryHelperInput = {
    pantry_items: pantryItems,
    goal,
    daily_protein_target_g: positive(row?.protein_target_g, DEFAULT_PROFILE.protein_target_g),
    avoid: strings(row?.dislikes),
    preferred_cuisines: strings(row?.cuisines),
    fridge_size: fridgeSize,
    fridge_note: FRIDGE_SIZES.find((f) => f.value === fridgeSize)?.hint ?? "",
  };

  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: RECOMMEND_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(grocerySuggestionsOutputSchema),
      },
      system: buildGrocerySystemPrompt(),
      messages: [{ role: "user", content: buildGroceryUserMessage(input) }],
    });
  } catch (error) {
    return fromApiError(error);
  }

  if (response.stop_reason === "refusal") {
    return fail("model_refused", "The model declined to suggest grocery items for this request.");
  }
  if (response.stop_reason === "max_tokens") {
    return fail("truncated_output", "The model ran out of room before finishing.");
  }

  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  const parsed = parseGrocerySuggestions(text);
  if (!parsed.ok) {
    console.warn("[grocery-suggestions] rejected output", { details: parsed.details });
    return fail("malformed_output", "The model returned something we couldn't use.", parsed.details);
  }

  const payload: GrocerySuggestionsSuccess = { suggestions: parsed.suggestions, model: response.model };
  return NextResponse.json(payload);
}

function fail(code: RecommendErrorCode, message: string, details?: string[]) {
  const body: RecommendFailure = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status: STATUS[code] });
}

/** Most specific first: a timeout is also a connection error, and every HTTP
 *  failure is also an APIError. Same mapping as /api/recommend/claude.ts's
 *  fromApiError, kept local since this route's error handling is otherwise
 *  much smaller and doesn't warrant a shared module yet. */
function fromApiError(error: unknown) {
  console.error("[grocery-suggestions] Claude API call failed", error);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return fail("llm_not_configured", "The server's Anthropic API key was rejected.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return fail("rate_limited", "Too many requests right now. Try again shortly.");
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return fail("upstream_timeout", "The recommender took too long to respond.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return fail("upstream_error", "Couldn't reach the recommender.");
  }
  if (error instanceof Anthropic.APIError) {
    return fail("upstream_error", `The recommender failed (HTTP ${error.status ?? "unknown"}).`);
  }
  return fail("upstream_error", "The recommender failed unexpectedly.");
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
