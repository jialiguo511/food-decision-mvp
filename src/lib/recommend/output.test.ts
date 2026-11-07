import { describe, expect, it } from "vitest";
import { parseRecommendations, stripLeakedImageQueryStep } from "./output";
import type { CookRecommendation, CookConstraints } from "../types";

const CONSTRAINTS: CookConstraints = {
  decision_mode: "cook",
  max_minutes: 60,
  budget_usd: 50,
  budget_source: "profile",
  equipment: [],
  equipment_known: false,
  no_cooking: true,
  no_shopping: false,
  allergies: [],
  dietary: { patterns: [], other: null },
};

function cookFields(overrides: { title: string; steps: string[] }) {
  return {
    title: overrides.title,
    reason: "A reasonable dinner.",
    estimated_minutes: 20,
    estimated_meal_cost_usd: 5,
    estimated_extra_cost_usd: 0,
    estimated_calories: 500,
    estimated_protein_g: 30,
    ingredients_on_hand: ["bread", "peanut butter"],
    ingredients_needed: [],
    equipment: [],
    steps: overrides.steps,
    inventory_note: null,
    image_query: "peanut butter toast",
  };
}

function rawResponse(steps: {
  best_match: string[];
  lowest_effort: string[];
  alternative: string[];
}) {
  return JSON.stringify({
    best_match: cookFields({ title: "Best Match Meal", steps: steps.best_match }),
    lowest_effort: cookFields({ title: "Lowest Effort Meal", steps: steps.lowest_effort }),
    alternative: cookFields({ title: "Alternative Meal", steps: steps.alternative }),
  });
}

describe("stripLeakedImageQueryStep", () => {
  it("removes an exact, case-insensitive, whitespace-padded 'image_query' entry", () => {
    expect(stripLeakedImageQueryStep(["Slice the bread.", "image_query"])).toEqual(["Slice the bread."]);
    expect(stripLeakedImageQueryStep(["Slice the bread.", "  Image_Query  "])).toEqual(["Slice the bread."]);
  });

  it("does not touch a real step that merely mentions the phrase", () => {
    const steps = ["Take a photo for the image_query field before serving."];
    expect(stripLeakedImageQueryStep(steps)).toEqual(steps);
  });

  it("leaves normal steps untouched", () => {
    const steps = ["Slice the bread.", "Spread peanut butter."];
    expect(stripLeakedImageQueryStep(steps)).toEqual(steps);
  });
});

describe("parseRecommendations — image_query leak into steps", () => {
  it("reproduces and sanitizes the reported bug: a stray 'image_query' step is stripped, not shown", () => {
    const text = rawResponse({
      best_match: ["Slice the bread.", "Spread peanut butter and honey.", "image_query"],
      lowest_effort: ["Mix yogurt and oats."],
      alternative: ["Slice the cucumber.", "Serve with toast."],
    });

    const result = parseRecommendations(text, CONSTRAINTS);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const bestMatch = result.recommendations.find((r) => r.role === "best_match") as CookRecommendation;
    expect(bestMatch.steps).toEqual(["Slice the bread.", "Spread peanut butter and honey."]);
    // Nothing in the other two recommendations should be touched.
    const alternative = result.recommendations.find((r) => r.role === "alternative") as CookRecommendation;
    expect(alternative.steps).toEqual(["Slice the cucumber.", "Serve with toast."]);
  });

  it("fails visibly, rather than rendering an empty recipe, if sanitizing empties a recommendation's steps", () => {
    const text = rawResponse({
      best_match: ["image_query"],
      lowest_effort: ["Mix yogurt and oats."],
      alternative: ["Slice the cucumber."],
    });

    const result = parseRecommendations(text, CONSTRAINTS);

    expect(result.ok).toBe(false);
  });
});
