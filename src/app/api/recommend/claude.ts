// The one place the product talks to Claude. It receives an already-constructed
// client, so the API key is read in route.ts and never passed around.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { estimateUsageCost } from "@/lib/recommend/cost";
import type { RecommendationInput } from "@/lib/recommend/input";
import type { PlaceCandidate } from "@/lib/places/candidates";
import {
  buildNearbyOutputSchema,
  buildOpenOutputSchema,
  buildOutputSchema,
  parseNearbyRecommendations,
  parseRecommendations,
} from "@/lib/recommend/output";
import { buildSystemPrompt, buildUserMessage } from "@/lib/recommend/prompt";
import type { Timer } from "@/lib/timing";
import type { RecommendErrorCode, RecommendSuccess } from "@/lib/types";

/** The product's default recommender. Both the model and how hard it thinks are
 *  server config (RECOMMEND_MODEL / RECOMMEND_EFFORT / RECOMMEND_THINKING in
 *  the environment) so another setting can be tried — and its quality judged —
 *  without a code change. Unset means exactly the defaults below.
 *
 *  Why Sonnet 5.5 at low effort (bench-results/recommend-2026-10-05*.md, 7 cases
 *  × 2 runs per config, the real prompt, parsing and validators): median 8.0 s
 *  against Opus 5 / high effort's 25.2 s (16–30 s), ~$0.021 a request against
 *  $0.072, every answer valid with no hard-constraint hits, and recipes read as
 *  comparable. Haiku 4.5 is no faster in practice and visibly worse (14–18 g
 *  protein where the others give 30–55 g). The target is "fast enough, follows
 *  the constraints, useful" — not maximum reasoning. Re-run `npm run
 *  bench:recommend` before changing this. */
export const DEFAULT_RECOMMEND_MODEL = "claude-sonnet-5-5";
export const DEFAULT_RECOMMEND_EFFORT: ModelSettings["effort"] = "low";
export const RECOMMEND_MODEL = DEFAULT_RECOMMEND_MODEL;

export type ModelSettings = { model: string; effort: "low" | "medium" | "high"; thinking: "adaptive" | "off" };

/** Haiku 4.5 takes neither `effort` nor adaptive thinking (it errors on effort). */
const isHaiku = (model: string) => /haiku/i.test(model);

/**
 * The `thinking` / `effort` request fields for these settings, per model.
 * "off" is spelled differently by model: Opus 5 accepts `disabled`; Sonnet 5.5
 * rejects `disabled` and uses `between_tools`; Opus 5.5 cannot turn thinking
 * off at all (lower the effort instead), so nothing is sent for it. Omitting
 * `thinking` on these models means ADAPTIVE, so "off" must send something.
 */
export function modelParams(settings: ModelSettings): { thinking?: Record<string, unknown>; effort?: ModelSettings["effort"] } {
  if (isHaiku(settings.model)) return {};
  if (settings.thinking === "adaptive") return { thinking: { type: "adaptive" }, effort: settings.effort };
  if (/opus-5-5/.test(settings.model)) return { effort: settings.effort };
  if (/sonnet-5-5/.test(settings.model)) return { thinking: { type: "between_tools" }, effort: settings.effort };
  return { thinking: { type: "disabled" }, effort: settings.effort };
}

export function resolveModelSettings(env: Record<string, string | undefined> = process.env): ModelSettings {
  const effort = env.RECOMMEND_EFFORT;
  return {
    model: env.RECOMMEND_MODEL?.trim() || DEFAULT_RECOMMEND_MODEL,
    effort: effort === "low" || effort === "medium" || effort === "high" ? effort : DEFAULT_RECOMMEND_EFFORT,
    thinking: env.RECOMMEND_THINKING === "off" ? "off" : "adaptive",
  };
}

export type GenerateResult =
  | {
      ok: true;
      recommendations: RecommendSuccess["recommendations"];
      /** True only for strict "Use what I have" with zero recommendations —
       *  the user's ingredients don't reasonably add up to a meal. */
      insufficientInventory: boolean;
      model: string;
      /** What this one call used (thinking tokens count as output). */
      usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null };
    }
  | { ok: false; code: RecommendErrorCode; message: string; details?: string[] };

/** Rejected output a second try can plausibly fix: a hard constraint slipped in
 *  (an appliance the user doesn't own, an ingredient they don't have) or the
 *  JSON didn't validate. A refusal, a truncation, a timeout or a transport
 *  error is never retried here — asking again would not change the answer. */
const RETRYABLE_CODES: readonly RecommendErrorCode[] = ["malformed_output", "constraint_violation"];

/** The validation retry only happens when the first attempt was quick: a slow
 *  first call plus a second would be the very wait this retry exists to avoid
 *  — and the limit keeps a request's worst case bounded. */
export const RETRY_ONLY_IF_FIRST_UNDER_MS = 25_000;

/** At most this many of the validator's findings go back to the model. */
const MAX_FINDINGS_SENT = 3;

/** One call to the model, parsed and validated. `tokens` is what it cost —
 *  a rejected answer was still paid for. */
type Attempt = { result: GenerateResult; model: string | null; tokens: { input: number; output: number } };

export async function generateRecommendations(
  client: Anthropic,
  input: RecommendationInput,
  /** Required for (and only read by) nearby requests: the places the model is
   *  allowed to choose from, checked again on the way out. */
  candidates: readonly PlaceCandidate[] = [],
  timer?: Timer,
  options: {
    /** Aborts the model call (the browser went away on purpose). */
    signal?: AbortSignal;
    /** Overrides the environment's settings — used by the benchmark only. */
    settings?: ModelSettings;
  } = {},
): Promise<GenerateResult> {
  const startedAt = Date.now();
  const settings = options.settings ?? resolveModelSettings();
  const params = modelParams(settings);
  // Strict "Use what I have" is the one case where fewer than three is valid.
  const strictInventory = input.decision_mode === "cook" && input.hard_constraints.no_shopping;
  const outputSchema =
    input.decision_mode === "nearby"
      ? buildNearbyOutputSchema(candidates.length)
      : input.decision_mode === "open"
        ? buildOpenOutputSchema(input.hard_constraints.ways)
        : buildOutputSchema(input.decision_mode, { allowFewer: strictInventory });
  const onHand = input.decision_mode === "cook" ? input.soft_preferences.ingredients_on_hand : [];
  // Prompt + schema construction is pure CPU; timed separately so it is never
  // blamed (or forgotten) when the model call is slow.
  const promptStart = performance.now();
  const system = buildSystemPrompt(input);
  const userMessage = buildUserMessage(input);
  const format = zodOutputFormat(outputSchema);
  timer?.record("prompt", performance.now() - promptStart);

  const attempt = async (message: string): Promise<Attempt> => {
    let response: Anthropic.Beta.BetaMessage;
    const modelStart = performance.now();
    try {
      response = await client.beta.messages.create(
        {
          model: settings.model,
          max_tokens: 16000,
          // If a safety classifier declines, the API re-runs the request on its
          // recommended fallback model instead of returning the refusal.
          ...(isHaiku(settings.model) ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
          ...(params.thinking ? { thinking: params.thinking as { type: "adaptive" } } : {}),
          output_config: {
            ...(params.effort ? { effort: params.effort } : {}),
            // Constrains decoding to the schema. Parsing stays ours, below.
            format,
          },
          system,
          messages: [{ role: "user", content: message }],
        },
        { signal: options.signal },
      );
    } catch (error) {
      timer?.record("model", performance.now() - modelStart);
      return { result: fromApiError(error), model: null, tokens: { input: 0, output: 0 } };
    }
    timer?.record("model", performance.now() - modelStart);
    const tokens = { input: response.usage.input_tokens, output: response.usage.output_tokens };

    if (response.stop_reason === "refusal") {
      return { result: { ok: false, code: "model_refused", message: "The model declined to recommend meals for this request." }, model: response.model, tokens };
    }
    if (response.stop_reason === "max_tokens") {
      return { result: { ok: false, code: "truncated_output", message: "The model ran out of room before finishing." }, model: response.model, tokens };
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("");

    const parseStart = performance.now();
    const parsed =
      input.decision_mode === "nearby"
        ? parseNearbyRecommendations(text, candidates, input.hard_constraints.allergies)
        : parseRecommendations(text, input.hard_constraints, onHand);
    timer?.record("parse", performance.now() - parseStart);
    if (!parsed.ok) {
      console.warn("[recommend] rejected output", { code: parsed.code, details: parsed.details });
      return {
        result: {
          ok: false,
          code: parsed.code,
          message:
            parsed.code === "constraint_violation"
              ? "The recommendations broke a hard constraint, so none were shown."
              : "The model returned something we couldn't use.",
          details: parsed.details,
        },
        model: response.model,
        tokens,
      };
    }
    return {
      result: {
        ok: true,
        recommendations: parsed.recommendations,
        insufficientInventory: parsed.insufficientInventory,
        model: response.model,
        usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: null }, // filled in below, once every attempt is counted
      },
      model: response.model,
      tokens,
    };
  };

  let last = await attempt(userMessage);
  const tokens = { ...last.tokens };

  // One automatic second try when the answer was rejected by our own checks:
  // a faster model now and then names a forbidden appliance or breaks the JSON,
  // and showing the user an error for that — when asking again fixes it — is the
  // worse product. The model is told exactly what was rejected. Never after the
  // user moved on, and never when the first try was already slow.
  const rejected = last.result;
  if (
    !rejected.ok &&
    RETRYABLE_CODES.includes(rejected.code) &&
    !options.signal?.aborted &&
    Date.now() - startedAt < RETRY_ONLY_IF_FIRST_UNDER_MS
  ) {
    console.warn("[recommend] retrying once after rejected output", { code: rejected.code });
    last = await attempt(`${userMessage}\n\n${correctionNote(rejected.details)}`);
    tokens.input += last.tokens.input;
    tokens.output += last.tokens.output;
  }

  if (!last.result.ok) return last.result;
  const usage = logUsage(last.model ?? last.result.model, { input_tokens: tokens.input, output_tokens: tokens.output }, Date.now() - startedAt, settings);
  return { ...last.result, usage };
}

/** What goes back to the model after a rejected answer: our own validator's
 *  wording, nothing from the user. */
function correctionNote(details: string[] | undefined): string {
  const findings = (details ?? []).slice(0, MAX_FINDINGS_SENT).map((d) => d.slice(0, 200));
  return [
    "## Correction needed",
    "",
    `Your previous answer was rejected by the app's own checks${findings.length > 0 ? `: ${findings.join("; ")}` : ""}.`,
    "Return the complete set again, fixing exactly that while still obeying every hard constraint above. Do not mention this correction.",
  ].join("\n");
}

/** Server-side usage/cost log for one successful recommendation request. Never
 *  logs the API key or the request/response content — model, token counts,
 *  duration, and an estimated cost derived from a local price table only. */
function logUsage(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
  durationMs: number,
  settings: ModelSettings,
): { inputTokens: number; outputTokens: number; estimatedCostUsd: number | null } {
  const { inputTokens, outputTokens, totalTokens, estimatedCostUsd } = estimateUsageCost(model, usage);
  console.info("[recommend] usage", {
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    duration_ms: durationMs,
    effort: settings.effort,
    thinking: settings.thinking,
    estimated_api_cost_usd: estimatedCostUsd ?? "unknown (no pricing for this model)",
  });
  return { inputTokens, outputTokens, estimatedCostUsd };
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
