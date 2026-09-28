// The one place the product talks to Claude. It receives an already-constructed
// client, so the API key is read in route.ts and never passed around.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { estimateUsageCost } from "@/lib/recommend/cost";
import type { RecommendationInput } from "@/lib/recommend/input";
import { buildOutputSchema, parseRecommendations } from "@/lib/recommend/output";
import { buildSystemPrompt, buildUserMessage } from "@/lib/recommend/prompt";
import type { RecommendErrorCode, RecommendSuccess } from "@/lib/types";

export const RECOMMEND_MODEL = "claude-opus-5";

export type GenerateResult =
  | {
      ok: true;
      recommendations: RecommendSuccess["recommendations"];
      /** True only for strict "Use what I have" with zero recommendations —
       *  the user's ingredients don't reasonably add up to a meal. */
      insufficientInventory: boolean;
      model: string;
    }
  | { ok: false; code: RecommendErrorCode; message: string; details?: string[] };

export async function generateRecommendations(
  client: Anthropic,
  input: RecommendationInput,
): Promise<GenerateResult> {
  const startedAt = Date.now();
  // Strict "Use what I have" is the one case where fewer than three is valid.
  const strictInventory = input.decision_mode === "cook" && input.hard_constraints.no_shopping;
  const onHand = input.decision_mode === "cook" ? input.soft_preferences.ingredients_on_hand : [];
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: RECOMMEND_MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, the API re-runs the request on its
      // recommended fallback model instead of returning the refusal.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        // Constrains decoding to the schema. Parsing stays ours, below.
        format: zodOutputFormat(buildOutputSchema(input.decision_mode, { allowFewer: strictInventory })),
      },
      system: buildSystemPrompt(input),
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });
  } catch (error) {
    return fromApiError(error);
  }

  if (response.stop_reason === "refusal") {
    return { ok: false, code: "model_refused", message: "The model declined to recommend meals for this request." };
  }
  if (response.stop_reason === "max_tokens") {
    return { ok: false, code: "truncated_output", message: "The model ran out of room before finishing." };
  }

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");

  const parsed = parseRecommendations(text, input.hard_constraints, onHand);
  if (!parsed.ok) {
    console.warn("[recommend] rejected output", { code: parsed.code, details: parsed.details });
    return {
      ok: false,
      code: parsed.code,
      message:
        parsed.code === "constraint_violation"
          ? "The recommendations broke a hard constraint, so none were shown."
          : "The model returned something we couldn't use.",
      details: parsed.details,
    };
  }

  logUsage(response.model, response.usage, Date.now() - startedAt);
  return {
    ok: true,
    recommendations: parsed.recommendations,
    insufficientInventory: parsed.insufficientInventory,
    model: response.model,
  };
}

/** Server-side usage/cost log for one successful recommendation request. Never
 *  logs the API key or the request/response content — model, token counts,
 *  duration, and an estimated cost derived from a local price table only. */
function logUsage(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
  durationMs: number,
): void {
  const { inputTokens, outputTokens, totalTokens, estimatedCostUsd } = estimateUsageCost(model, usage);
  console.info("[recommend] usage", {
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    duration_ms: durationMs,
    estimated_api_cost_usd: estimatedCostUsd ?? "unknown (no pricing for this model)",
  });
}

/** Most specific first: a timeout is also a connection error, and every HTTP
 *  failure is also an APIError. */
function fromApiError(error: unknown): GenerateResult {
  console.error("[recommend] Claude API call failed", error);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return { ok: false, code: "llm_not_configured", message: "The server's Anthropic API key was rejected." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { ok: false, code: "rate_limited", message: "Too many requests right now. Try again shortly." };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { ok: false, code: "upstream_timeout", message: "The recommender took too long to respond." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { ok: false, code: "upstream_error", message: "Couldn't reach the recommender." };
  }
  if (error instanceof Anthropic.APIError) {
    return { ok: false, code: "upstream_error", message: `The recommender failed (HTTP ${error.status ?? "unknown"}).` };
  }
  return { ok: false, code: "upstream_error", message: "The recommender failed unexpectedly." };
}
