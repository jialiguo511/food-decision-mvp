import { describe, expect, it } from "vitest";
import { formsAgree, relevanceScore, selectRelevantPhoto, tokenize } from "./relevance";

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

describe("the wrong-dish cases: matching words are not enough", () => {
  const pick = (query: string, alts: string[]) => selectRelevantPhoto(query, alts, (a) => a);

  it("smoked-salmon cucumber roll-ups is NOT a sushi photo (the reported bug)", () => {
    const sushi = ["Close-up of salmon nigiri sushi with cucumber slices and chopsticks", "Sushi platter with salmon, cucumber rolls and ginger"];
    expect(pick("smoked salmon cucumber roll-ups", sushi)).toBeNull();
    expect(pick("smoked salmon cucumber roll-ups with cream cheese", sushi)).toBeNull();
  });

  it("…while a photo that really is that food still matches", () => {
    expect(pick("smoked salmon cucumber roll-ups", ["Cucumber roll-ups filled with smoked salmon and cream cheese", "Sushi with salmon"])).toBe("Cucumber roll-ups filled with smoked salmon and cream cheese");
  });

  it("a kind of dish the query names must be in the photo", () => {
    expect(pick("tuna wrap", ["Tuna salad on a plate"])).toBeNull(); // right ingredient, wrong dish
    expect(pick("tuna wrap", ["A tuna wrap cut in half on a board"])).not.toBeNull();
  });

  it("a different dish the photo shows is a contradiction, however many words overlap", () => {
    expect(pick("chicken rice", ["Chicken rice soup in a pot"])).toBeNull();
    expect(pick("chicken tomato", ["Chicken and tomato pizza"])).toBeNull();
    expect(pick("chicken pizza", ["Chicken pizza slice"])).not.toBeNull();
  });

  it("generic words (bowl, salad, toast) showing up incidentally are not a contradiction", () => {
    expect(pick("salmon avocado", ["Grilled salmon with avocado on toast"])).not.toBeNull();
  });

  it("synonyms count: a sandwich query accepts a panini photo", () => {
    expect(formsAgree(tokenize("turkey sandwich"), "Turkey panini with cheese")).toBe(true);
  });

  it("a photo with no description can never be confirmed, so it is never shown", () => {
    expect(pick("chicken rice bowl", [""])).toBeNull();
  });

  it("two words need both (a single shared word is no longer enough)", () => {
    expect(pick("greek yogurt", ["Bowl of yogurt with honey"])).toBeNull();
    expect(pick("greek yogurt", ["Greek yogurt with honey"])).not.toBeNull();
  });
});
