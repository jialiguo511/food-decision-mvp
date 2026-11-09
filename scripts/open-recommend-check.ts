// The REAL recommender on cross-way ("open") requests: one model call, up to three
// cards, each one way of eating — checked by the app's own validators and by a few
// independent literal checks of the things that matter most.
//
//   OPEN_CONFIRM=1 npm run check:open
//
// Costs real money (one Sonnet call per case, roughly 2 cents) and needs
// ANTHROPIC_API_KEY in .env.local. Skipped without OPEN_CONFIRM=1. Writes nothing.

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { generateRecommendations } from "@/app/api/recommend/claude";
import { findAllergenMentions } from "@/lib/foodTerms";
import { resolveRecommendationInput } from "@/lib/recommend/input";
import { recipeText } from "@/lib/recommend/textChecks";
import type { CookRecommendation, OpenContext, ProfileInput, Recommendation } from "@/lib/types";
import { DEFAULT_PROFILE } from "@/test/profileInput";

const run = process.env.OPEN_CONFIRM === "1" && !!process.env.ANTHROPIC_API_KEY;

const OPEN: OpenContext = {
  decision_mode: "open",
  hunger: "normal",
  ways: { cook: true, buy: true },
  meal_only: false,
  minutes: null,
  effort: null,
  extra_spend_usd: null,
  meal_budget: "no_preference",
  ingredients_on_hand: [],
  craving: null,
  after_exercise: false,
  protein_focus: false,
  easy_pick: false,
};

async function recommend(label: string, context: OpenContext, profile: ProfileInput = DEFAULT_PROFILE, previous?: Recommendation[]) {
  const input = resolveRecommendationInput(profile, context, previous, []);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY as string, timeout: 90_000, maxRetries: 1 });
  const started = Date.now();
  const result = await generateRecommendations(client, input, [], undefined);
  const ms = Date.now() - started;
  if (!result.ok) {
    console.info(`\n[${label}] FAILED ${result.code}: ${result.message}\n  ${(result.details ?? []).join("\n  ")}`);
    throw new Error(`${label}: ${result.code}`);
  }
  const lines = result.recommendations.map((r) => `  ${r.role.padEnd(13)} ${r.decision_mode.padEnd(11)} ${r.title}${r.decision_mode === "cook" ? `  [image_query: ${r.image_query}]` : ""}  — ${r.reason}`);
  console.info(`\n[${label}] ${ms} ms, $${result.usage.estimatedCostUsd ?? "?"}\n${lines.join("\n")}`);
  return result.recommendations;
}

const ways = (recs: Recommendation[]) => recs.map((r) => r.decision_mode);
const allText = (recs: Recommendation[]) => JSON.stringify(recs);
/** Anything that says the person is short of, low in, or missing protein, or names an amount they lack. */
const DEFICIT_CLAIM = /\b(you(?:'re| are)? (?:low|short|deficient|lacking)|protein (?:gap|deficit|shortfall|deficiency)|(?:missing|lack(?:ing)?|not enough|insufficient) (?:in )?protein|make up (?:for )?(?:the )?(?:missing|lost)|catch up on protein)\b/i;

describe.skipIf(!run)("open recommendations — real model", () => {
  it("the motivating request: not very hungry, after exercise, wants protein, buy or make", async () => {
    // Equipment UNKNOWN (never told): nothing is assumed, so any recipe must be a no-heat assembly.
    const recs = await recommend("motivating", { ...OPEN, hunger: "light", after_exercise: true, protein_focus: true }, { ...DEFAULT_PROFILE, equipment: [] });
    expect(recs).toHaveLength(3);
    expect(allText(recs)).not.toMatch(DEFICIT_CLAIM); // the person's wish is not a verified shortfall
    expect(allText(recs)).not.toMatch(/\b\d+\s?(?:g|grams)\s+(?:of\s+)?(?:protein\s+)?(?:short|missing|behind|deficit)/i);
    for (const r of recs) expect(["cook", "order", "store_snack"]).toContain(r.decision_mode);
    for (const r of recs.filter((x): x is CookRecommendation => x.decision_mode === "cook")) expect(r.equipment).toEqual([]);
  });

  it("buy or make, you decide: three options, any mix", async () => {
    const recs = await recommend("either way", { ...OPEN, easy_pick: true });
    expect(recs).toHaveLength(3);
    expect(new Set(recs.map((r) => r.title.toLowerCase())).size).toBe(3);
  });

  it("'I don't want to cook': NOT ONE recipe", async () => {
    const recs = await recommend("no cooking", { ...OPEN, ways: { cook: false, buy: true } });
    expect(recs).toHaveLength(3);
    expect(ways(recs)).not.toContain("cook");
  });

  it("'just something': every card is low-burden", async () => {
    const recs = await recommend("just something", { ...OPEN, easy_pick: true });
    expect(recs).toHaveLength(3);
    for (const r of recs.filter((x): x is CookRecommendation => x.decision_mode === "cook")) expect(r.estimated_minutes).toBeLessThanOrEqual(15);
  });

  it("does not invent a kitchen or a place: nothing assumed on hand, no restaurant or store named, no prices", async () => {
    const recs = await recommend("unknowns", { ...OPEN, hunger: "light" });
    for (const r of recs.filter((x): x is CookRecommendation => x.decision_mode === "cook")) {
      expect(r.ingredients_needed.length + r.ingredients_on_hand.length).toBeGreaterThan(0);
      expect(r.ingredients_on_hand, "nothing was said to be on hand").toEqual([]);
    }
    expect(allText(recs)).not.toMatch(/\bnear(?:by| you)\b|\$\s?\d/i);
  });

  it("an allergy holds across every way", async () => {
    const recs = await recommend("peanut allergy", { ...OPEN, easy_pick: true, protein_focus: true }, { ...DEFAULT_PROFILE, allergies: ["Peanuts"] });
    for (const r of recs) expect(findAllergenMentions(r.decision_mode === "cook" ? recipeText(r) : JSON.stringify(r), ["Peanuts"]), r.title).toEqual([]);
  });

  it("a vegetarian pattern holds across every way", async () => {
    const recs = await recommend("vegetarian", { ...OPEN, protein_focus: true }, { ...DEFAULT_PROFILE, dietary_patterns: ["vegetarian"] });
    expect(allText(recs)).not.toMatch(/\b(chicken|beef|pork|bacon|ham|turkey|tuna|salmon|shrimp|steak|sausage|jerky)\b/i);
  });

  it("'Show me 3 more' (three rounds in a row): every round is accepted and none repeats an earlier title", async () => {
    // Unknown equipment, the motivating situation — the case a person actually hit.
    const profile = { ...DEFAULT_PROFILE, equipment: [] };
    const context = { ...OPEN, hunger: "light" as const, after_exercise: true, protein_focus: true };
    let previous: Recommendation[] | undefined;
    const seen = new Set<string>();
    for (let round = 1; round <= 3; round++) {
      const recs = await recommend(`more round ${round}`, context, profile, previous);
      expect(recs).toHaveLength(3);
      for (const r of recs) expect(seen.has(r.title.toLowerCase()), `round ${round} repeated "${r.title}"`).toBe(false);
      for (const r of recs) seen.add(r.title.toLowerCase());
      previous = recs;
    }
  });
});
