// Pricing for estimating the cost of a single /api/recommend call, so usage
// can be watched in the server log before spending real API credits at scale.
// Server-side only — never imported by a client component.

/** USD per 1M tokens. Update when the configured model or its price changes. */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-opus-5-5": { input: 4.0, output: 20.0 },
  "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

export type UsageCost = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
};

/**
 * `model` is the model that actually served the request — the server-side
 * fallback can substitute a different one — so pricing is looked up per call,
 * not assumed from the configured model constant.
 */
export function estimateUsageCost(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): UsageCost {
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  // The API reports dated snapshot ids ("claude-haiku-4-5-20251001"); price by family.
  const price = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK[model.replace(/-\d{8}$/, "")];
  const estimatedCostUsd = price
    ? round(inputTokens * (price.input / 1_000_000) + outputTokens * (price.output / 1_000_000))
    : null; // Unknown model (e.g. a fallback not in the table) — report tokens, not a guessed cost.

  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, estimatedCostUsd };
}

function round(usd: number): number {
  return Math.round(usd * 1e6) / 1e6;
}
