import { describe, expect, it } from "vitest";
import { relevanceScore, selectRelevantPhoto, tokenize } from "./relevance";

describe("tokenize", () => {
  it("lowercases, splits on non-letters, drops stopwords and trivial plurals", () => {
    expect(tokenize("Peanut Butter Toast")).toEqual(["peanut", "butter", "toast"]);
    expect(tokenize("Bowl of Eggs and Avocado")).toEqual(["bowl", "egg", "avocado"]);
  });
});

describe("relevanceScore", () => {
  it("scores 1 when every query token appears in the alt text", () => {
    const score = relevanceScore(tokenize("peanut butter toast"), "Close-up of peanut butter toast with banana slices");
    expect(score).toBe(1);
  });

  it("scores partial overlap proportionally", () => {
    // "yogurt peanut butter bowl" vs a plain yogurt bowl — 2 of 4 tokens match.
    const score = relevanceScore(tokenize("yogurt peanut butter bowl"), "Bowl of yogurt with granola and berries");
    expect(score).toBe(0.5);
  });

  it("scores 0 for a mismatched dish", () => {
    const score = relevanceScore(tokenize("peanut butter toast"), "Avocado toast topped with a fried egg");
    expect(score).toBeLessThan(0.5);
  });

  it("scores 0 for empty or missing alt text", () => {
    expect(relevanceScore(tokenize("chicken rice bowl"), "")).toBe(0);
  });
});

describe("selectRelevantPhoto", () => {
  type Candidate = { id: number; alt: string };

  it("skips an irrelevant top result in favor of a relevant one further down", () => {
    // Mirrors the reported bug: Pexels' first hit for "peanut butter toast"
    // is an unrelated breakfast photo; a real match is further down the list.
    const candidates: Candidate[] = [
      { id: 1, alt: "Breakfast bowl with eggs, avocado, and fruit" },
      { id: 2, alt: "Peanut butter toast with sliced banana" },
      { id: 3, alt: "Bowl of granola and yogurt" },
    ];

    const result = selectRelevantPhoto("peanut butter toast", candidates, (c) => c.alt);
    expect(result?.id).toBe(2);
  });

  it("returns null when no candidate reaches the relevance threshold", () => {
    const candidates: Candidate[] = [
      { id: 1, alt: "Breakfast bowl with eggs, avocado, and fruit" },
      { id: 2, alt: "Grilled steak with roasted vegetables" },
    ];

    const result = selectRelevantPhoto("peanut butter toast", candidates, (c) => c.alt);
    expect(result).toBeNull();
  });

  it("prefers the higher-scoring candidate even if it isn't first", () => {
    const candidates: Candidate[] = [
      { id: 1, alt: "Bowl of yogurt with fruit" },
      { id: 2, alt: "Bowl of yogurt with peanut butter drizzle" },
    ];

    const result = selectRelevantPhoto("yogurt peanut butter bowl", candidates, (c) => c.alt);
    expect(result?.id).toBe(2);
  });
});
