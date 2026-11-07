// The Cook prompt is paid for on every request, and input + output tokens are
// latency. These pin the trimming (not the exact wording) so it doesn't creep
// back, and pin what trimming must NOT remove: the allergy and dietary rules
// whenever the user has any.

import { describe, expect, it } from "vitest";
import { cookContext } from "@/test/cookFixtures";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import { resolveRecommendationInput } from "./input";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

const cook = (profile = DEFAULT_PROFILE, context = cookContext()) => resolveRecommendationInput(profile, context, undefined, ["Salt", "Olive oil"]);

describe("Cook prompt size", () => {
  it("an everyday request stays well under the previous ~11,000-character system prompt", () => {
    expect(buildSystemPrompt(cook()).length).toBeLessThan(8_700);
  });

  it("the user message is compact single-line JSON, not pretty-printed", () => {
    const message = buildUserMessage(cook());
    expect(message.split("\n").length).toBeLessThanOrEqual(3);
    expect(message.length).toBeLessThan(800);
    expect(JSON.parse(message.slice(message.indexOf("{")))).toMatchObject({ decision_mode: "cook" });
  });

  it("asks for short recipes: few, one-sentence steps and a one-sentence reason", () => {
    const prompt = buildSystemPrompt(cook());
    expect(prompt).toContain("3–5 short, plain instructions, one sentence each");
    expect(prompt).toContain("reason: one short sentence");
  });
});

describe("trimming never removes a hard constraint the user actually has", () => {
  it("with no allergies or diet recorded, the rules collapse to one line each", () => {
    const prompt = buildSystemPrompt(cook());
    expect(prompt).toContain("- Allergies: none recorded.");
    expect(prompt).toContain("- Dietary pattern: none stated.");
  });

  it("with allergies, the full allergy rule is there", () => {
    const prompt = buildSystemPrompt(cook({ ...DEFAULT_PROFILE, allergies: ["peanuts"] }));
    expect(prompt).toContain("safety constraint, never a preference");
    expect(prompt).toContain("Never say or imply a meal is allergen-free or safe");
    expect(prompt).not.toContain("Allergies: none recorded");
  });

  it("with a dietary pattern — or only the user's own words — the full dietary rule is there", () => {
    for (const diet of [{ dietary_patterns: ["vegan" as const], dietary_other: null }, { dietary_patterns: [], dietary_other: "no red meat" }]) {
      const prompt = buildSystemPrompt(cook({ ...DEFAULT_PROFILE, ...diet }));
      expect(prompt).toContain("a hard constraint, as binding as allergies");
      expect(prompt).not.toContain("Dietary pattern: none stated");
    }
  });

  it("the equipment, time, budget and shopping rules are all still there", () => {
    const prompt = buildSystemPrompt(cook());
    for (const rule of ["- Equipment:", "- Time:", "- Budget:", "- Shopping:", "Strict"]) {
      if (rule !== "Strict") expect(prompt).toContain(rule);
    }
    expect(buildSystemPrompt(cook(DEFAULT_PROFILE, cookContext({ shopping: "inventory_only", ingredients_on_hand: ["Eggs"] })))).toContain("Strict inventory rules");
  });
});

describe("usage cost estimate", () => {
  it("prices the configurations the benchmark compares, including dated snapshot ids", async () => {
    const { estimateUsageCost } = await import("./cost");
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
    expect(estimateUsageCost("claude-opus-5", usage).estimatedCostUsd).toBe(30);
    expect(estimateUsageCost("claude-sonnet-5-5", usage).estimatedCostUsd).toBe(12);
    expect(estimateUsageCost("claude-haiku-4-5-20251001", usage).estimatedCostUsd).toBe(6);
    expect(estimateUsageCost("some-future-model", usage).estimatedCostUsd).toBeNull();
  });
});
