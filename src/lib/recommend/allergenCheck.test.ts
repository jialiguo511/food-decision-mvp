// An allergy is a hard constraint in every mode. The prompt states it; this is
// the code behind the prompt for the modes that generate food (Cook, Get food by
// type, Snack): an allergy the user listed may not appear BY NAME in what is
// recommended. Literal only — a catch for a slip, never a safety guarantee (no
// aliases, no hidden ingredients; see foodTerms.findAllergenMentions). The
// "Find food near me" check is separate and unchanged (output.test / nearby.test).

import { describe, expect, it } from "vitest";
import { parseRecommendations } from "./output";
import type { ActiveConstraints } from "../types";

const dietary = { patterns: [], other: null };
const cook = (allergies: string[]): ActiveConstraints => ({
  decision_mode: "cook",
  max_minutes: 60,
  budget_usd: 50,
  budget_source: "profile",
  equipment: ["Stovetop"],
  equipment_known: true,
  no_cooking: false,
  no_shopping: false,
  allergies,
  dietary,
});
const order = (allergies: string[]): ActiveConstraints => ({ decision_mode: "order", allergies, dietary });
const snack = (allergies: string[]): ActiveConstraints => ({ decision_mode: "store_snack", allergies, dietary });

const cookCard = (title: string, ingredients: string[] = ["rice"], reason = "A reasonable dinner.") => ({
  title,
  reason,
  estimated_minutes: 20,
  estimated_meal_cost_usd: 5,
  estimated_extra_cost_usd: 0,
  estimated_calories: 500,
  estimated_protein_g: 30,
  watch: null,
  ingredients_on_hand: ingredients,
  ingredients_needed: [],
  equipment: ["Stovetop"],
  steps: ["Cook it on the stovetop.", "Serve."],
  inventory_note: null,
  image_query: "rice bowl",
});
const orderCard = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  reason: "Fits the craving.",
  search_terms: ["chicken rice bowl"],
  order_notes: "Chicken, rice, vegetables.",
  modification: null,
  watch: null,
  estimated_calories: 600,
  estimated_protein_g: 35,
  ...over,
});
const snackCard = (title: string, over: Record<string, unknown> = {}) => ({
  title,
  reason: "Salty and quick.",
  what_to_look_for: "A single-serve bag of pretzels.",
  backup: null,
  watch: null,
  estimated_calories: 200,
  estimated_protein_g: 6,
  ...over,
});
const three = (a: unknown, b: unknown, c: unknown) => JSON.stringify({ best_match: a, lowest_effort: b, alternative: c });

describe("Cook: an allergen named in the recipe is rejected", () => {
  const clean = [cookCard("Chicken Rice Bowl"), cookCard("Egg Fried Rice", ["eggs", "rice"]), cookCard("Tofu Stir-Fry", ["tofu"])];

  it("passes when nothing named is an allergen", () => {
    expect(parseRecommendations(three(...(clean as [unknown, unknown, unknown])), cook(["Peanuts"])).ok).toBe(true);
  });

  it("rejects an allergen in the title", () => {
    const text = three(cookCard("Peanut Noodles"), clean[1], clean[2]);
    const result = parseRecommendations(text, cook(["Peanuts"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("constraint_violation");
      expect(result.details.join(" ")).toMatch(/best_match: names Peanuts/);
    }
  });

  it("rejects an allergen in an ingredient or a step, and says which card", () => {
    const text = three(clean[0], cookCard("Quick Bowl", ["rice", "shrimp"]), clean[2]);
    const result = parseRecommendations(text, cook(["Shrimp"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.details.join(" ")).toMatch(/lowest_effort: names Shrimp/);
  });

  it("does not fire on a different word that merely contains it (eggplant is not Eggs)", () => {
    const text = three(cookCard("Eggplant Rice Bowl", ["eggplant"]), clean[1], clean[2]);
    // Eggs appears in the second card, so only that one may be flagged.
    const result = parseRecommendations(text, cook(["Eggs"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.details.join(" ")).not.toMatch(/best_match/);
      expect(result.details.join(" ")).toMatch(/lowest_effort: names Eggs/);
    }
  });

  it("with no allergies listed nothing is checked", () => {
    expect(parseRecommendations(three(cookCard("Peanut Noodles"), clean[1], clean[2]), cook([])).ok).toBe(true);
  });

  it("still reports the other hard-constraint failures alongside it", () => {
    const text = three({ ...cookCard("Peanut Noodles"), steps: ["Cook in the air fryer."] }, clean[1], clean[2]);
    const result = parseRecommendations(text, cook(["Peanuts"]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const details = result.details.join(" ");
      expect(details).toMatch(/air fryer/);
      expect(details).toMatch(/names Peanuts/);
    }
  });
});

describe("Get food by type: an allergen in the search terms, order or tweak is rejected", () => {
  const fine = [orderCard("Chicken Rice Bowl"), orderCard("Veggie Burrito Bowl"), orderCard("Salmon Poke Bowl")];

  it("passes a clean set", () => {
    expect(parseRecommendations(three(...(fine as [unknown, unknown, unknown])), order(["Peanuts"])).ok).toBe(true);
  });

  it.each([
    ["title", { title: "Peanut Sauce Noodles" }],
    ["search terms", { search_terms: ["pad thai with peanuts"] }],
    ["order notes", { order_notes: "Noodles with peanut sauce." }],
    ["modification", { modification: "Add crushed peanuts on top." }],
  ])("rejects it in the %s", (_where, over) => {
    const result = parseRecommendations(three(orderCard("Chicken Rice Bowl", over), fine[1], fine[2]), order(["Peanuts"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("constraint_violation");
  });

  it("does not read the prose: a reason that names the allergen to say it is avoided is left alone", () => {
    const result = parseRecommendations(three(orderCard("Chicken Rice Bowl", { reason: "No peanuts here, and quick." }), fine[1], fine[2]), order(["Peanuts"]));
    expect(result.ok).toBe(true);
  });
});

describe("Snack: an allergen in the item or where to look is rejected", () => {
  const fine = [snackCard("Salted Pretzels"), snackCard("Cheese Crackers"), snackCard("Rice Cakes")];

  it("passes a clean set", () => {
    expect(parseRecommendations(three(...(fine as [unknown, unknown, unknown])), snack(["Peanuts"])).ok).toBe(true);
  });

  it.each([
    ["title", { title: "Peanut Butter Crackers" }],
    ["what to look for", { what_to_look_for: "A small pack of salted peanuts." }],
    ["backup", { backup: "Trail mix with peanuts." }],
  ])("rejects it in the %s", (_where, over) => {
    const result = parseRecommendations(three(snackCard("Salted Pretzels", over), fine[1], fine[2]), snack(["Peanuts"]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("constraint_violation");
  });
});
