import { describe, expect, it } from "vitest";
import { COOK_CRAVING_EXCLUSIVE, joinCraving, splitCraving, toggleCompatible } from "./cravings";
import { COMMON_CRAVINGS } from "./options";

describe("several compatible cravings", () => {
  it("joins chips and typed words into the one craving text, and reads them back", () => {
    const text = joinCraving(["Light and clean", "Vegetarian"], "  something   with rice ");
    expect(text).toBe("Light and clean, Vegetarian, something with rice");
    expect(splitCraving(text, COMMON_CRAVINGS)).toEqual({ chips: ["Light and clean", "Vegetarian"], custom: "something with rice" });
  });

  it("nothing picked is no craving (No preference)", () => {
    expect(joinCraving([], "   ")).toBeNull();
    expect(splitCraving(null, COMMON_CRAVINGS)).toEqual({ chips: [], custom: "" });
  });

  it("an old single craving still reads as one chip; typed text with commas stays text", () => {
    expect(splitCraving("Soup", COMMON_CRAVINGS)).toEqual({ chips: ["Soup"], custom: "" });
    expect(splitCraving("noodles, extra spicy", COMMON_CRAVINGS)).toEqual({ chips: [], custom: "noodles, extra spicy" });
  });

  it("compatible choices add up; contradictory ones replace each other", () => {
    let picked = toggleCompatible<string>([], "Light and clean", COOK_CRAVING_EXCLUSIVE);
    picked = toggleCompatible(picked, "Vegetarian", COOK_CRAVING_EXCLUSIVE);
    expect(picked).toEqual(["Light and clean", "Vegetarian"]);
    picked = toggleCompatible(picked, "Comfort food", COOK_CRAVING_EXCLUSIVE);
    expect(picked).toEqual(["Vegetarian", "Comfort food"]);
    expect(toggleCompatible(picked, "Vegetarian", COOK_CRAVING_EXCLUSIVE)).toEqual(["Comfort food"]);
  });
});
