import { describe, expect, it } from "vitest";
import { parseStoredSession } from "./session";
import type { CookRecommendation } from "../types";

function cookFields(overrides: { title: string; steps: string[] }) {
  return {
    decision_mode: "cook" as const,
    role: "best_match" as const,
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

function row(recommendations: unknown[]) {
  return {
    id: "session-1",
    chosen_index: null,
    context: {
      decision_mode: "cook",
      cook_minutes: 30,
      hunger: "normal",
      effort: "some",
      shopping: "can_buy",
      craving: null,
      ingredients_on_hand: ["bread", "peanut butter"],
      budget_override_usd: null,
    },
    recommendations,
  };
}

describe("parseStoredSession — image_query leak into steps", () => {
  it("sanitizes a stray 'image_query' step already saved on an old row", () => {
    const restored = parseStoredSession(
      row([
        cookFields({ title: "Peanut Butter Toast", steps: ["Toast the bread.", "Spread peanut butter.", "image_query"] }),
        { ...cookFields({ title: "Other Meal", steps: ["Do the thing."] }), role: "lowest_effort" },
        { ...cookFields({ title: "Third Meal", steps: ["Do another thing."] }), role: "alternative" },
      ]),
    );

    expect(restored).not.toBeNull();
    const bestMatch = restored?.session.recommendations.find((r) => r.role === "best_match") as CookRecommendation;
    expect(bestMatch.steps).toEqual(["Toast the bread.", "Spread peanut butter."]);
  });

  it("discards the row as corrupted if sanitizing would empty a recommendation's steps", () => {
    const restored = parseStoredSession(
      row([
        cookFields({ title: "Peanut Butter Toast", steps: ["image_query"] }),
        { ...cookFields({ title: "Other Meal", steps: ["Do the thing."] }), role: "lowest_effort" },
        { ...cookFields({ title: "Third Meal", steps: ["Do another thing."] }), role: "alternative" },
      ]),
    );

    expect(restored).toBeNull();
  });
});
