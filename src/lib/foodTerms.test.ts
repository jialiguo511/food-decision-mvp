import { describe, expect, it } from "vitest";
import { COMMON_ALLERGIES, COMMON_DISLIKES } from "./options";
import { findAllergenMentions, normalizeFoodLists, normalizeTerm, normalizeTerms } from "./foodTerms";

describe("normalizeTerm(s)", () => {
  it("trims, collapses whitespace, and unifies casing", () => {
    expect(normalizeTerm("  sesame   SEEDS ")).toBe("Sesame seeds");
    expect(normalizeTerm("   ")).toBeNull();
  });
  it("keeps a known chip's own spelling", () => {
    expect(normalizeTerm("tree NUTS", COMMON_ALLERGIES)).toBe("Tree nuts");
    expect(normalizeTerm("wheat / gluten", COMMON_ALLERGIES)).toBe("Wheat / gluten");
  });
  it("drops case-insensitive duplicates, keeping the first", () => {
    expect(normalizeTerms(["Peanuts", "peanuts", " PEANUTS ", "Soy"], COMMON_ALLERGIES)).toEqual(["Peanuts", "Soy"]);
  });
  it("bounds length and count", () => {
    expect(normalizeTerm("x".repeat(200))?.length).toBe(60);
    expect(normalizeTerms(Array.from({ length: 80 }, (_, i) => `food ${i}`))).toHaveLength(40);
  });
});

describe("normalizeFoodLists — allergies and dislikes stay separate", () => {
  it("removes an allergy from dislikes so it isn't listed as a mere preference", () => {
    const out = normalizeFoodLists(["Shellfish"], ["shellfish", "Cilantro"], { allergies: COMMON_ALLERGIES, dislikes: COMMON_DISLIKES });
    expect(out).toEqual({ allergies: ["Shellfish"], dislikes: ["Cilantro"] });
  });
  it("never turns a dislike into an allergy", () => {
    const out = normalizeFoodLists([], ["Mushrooms", "olives"], { dislikes: COMMON_DISLIKES });
    expect(out.allergies).toEqual([]);
    expect(out.dislikes).toEqual(["Mushrooms", "Olives"]);
  });
});

describe("findAllergenMentions — literal second layer, not an allergen database", () => {
  it("finds the allergen's own name, ignoring case, plurals and the user's spacing", () => {
    expect(findAllergenMentions("Try the Peanut noodles", ["Peanuts"])).toEqual(["Peanuts"]);
    expect(findAllergenMentions("a satay with PEANUTS on top", ["peanut"])).toEqual(["peanut"]);
    expect(findAllergenMentions("an omelette with eggs", ["  Eggs "])).toEqual(["  Eggs "]);
    expect(findAllergenMentions("a tree nut pesto", ["Tree nuts"])).toEqual(["Tree nuts"]);
  });

  it("splits a combined chip: 'Wheat / gluten' matches either word", () => {
    expect(findAllergenMentions("a wheat noodle bowl", ["Wheat / gluten"])).toHaveLength(1);
    expect(findAllergenMentions("a gluten-heavy pastry", ["Wheat / gluten"])).toHaveLength(1);
  });

  it("matches whole words only (Eggs is not eggplant, Soy is not soybean-free text by accident)", () => {
    expect(findAllergenMentions("grilled eggplant with rice", ["Eggs"])).toEqual([]);
    expect(findAllergenMentions("a sesame-crusted fish", ["Sesame"])).toEqual(["Sesame"]);
  });

  it("does not match an unrelated allergy, and an empty list never matches", () => {
    expect(findAllergenMentions("a grilled chicken and rice bowl, sauce on the side", ["Peanuts", "Dairy"])).toEqual([]);
    expect(findAllergenMentions("peanut noodles", [])).toEqual([]);
  });

  it("has no alias table: Shellfish does not match shrimp (the prompt, not this, covers that)", () => {
    expect(findAllergenMentions("a shrimp bowl", ["Shellfish"])).toEqual([]);
    expect(findAllergenMentions("a shellfish platter", ["Shellfish"])).toEqual(["Shellfish"]);
  });

  it("copes with regex characters in a typed allergy", () => {
    expect(findAllergenMentions("a bowl", ["(a+"])).toEqual([]);
  });
});
