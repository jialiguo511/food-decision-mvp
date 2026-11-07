import { describe, expect, it } from "vitest";
import { place, recipe } from "../../test/savedFixtures";
import { parseSavedPlaceRow, parseSavedRecipe, recipeKey, recipeProfileFlags, savedGuidanceIsAllowed, toSavedPlaceFields } from "./saved";


describe("recipeKey", () => {
  it("is stable for the same content, however it was regenerated", () => {
    const a = recipeKey(recipe());
    expect(recipeKey(recipe())).toBe(a);
    // Things that vary between generations don't change identity.
    expect(recipeKey(recipe({ reason: "Different words.", estimated_calories: 600, image_query: null, role: "alternative" }))).toBe(a);
    // Case, spacing and ingredient order don't either.
    expect(recipeKey(recipe({ title: "  peanut   NOODLE bowl ", ingredients_needed: ["Scallions", "Peanut butter"] }))).toBe(a);
  });

  it("differs for a genuinely different recipe", () => {
    const a = recipeKey(recipe());
    expect(recipeKey(recipe({ title: "Sesame Noodle Bowl" }))).not.toBe(a);
    expect(recipeKey(recipe({ steps: ["Boil.", "Serve."] }))).not.toBe(a);
    expect(recipeKey(recipe({ ingredients_needed: ["Tahini"] }))).not.toBe(a);
  });
});

describe("parseSavedRecipe", () => {
  it("round-trips the canonical recommendation", () => {
    expect(parseSavedRecipe(recipe())).toEqual(recipe());
  });

  it("accepts an older shape missing newer optional fields, with defaults", () => {
    const { image_query: _i, inventory_note: _n, watch: _w, ...old } = recipe();
    void [_i, _n, _w];
    expect(parseSavedRecipe(old)).toMatchObject({ title: "Peanut Noodle Bowl", image_query: null, inventory_note: null, watch: null });
  });

  it("rejects corrupt rows and other modes instead of rendering them", () => {
    expect(parseSavedRecipe(null)).toBeNull();
    expect(parseSavedRecipe({ decision_mode: "cook", title: "x" })).toBeNull();
    expect(parseSavedRecipe(place())).toBeNull();
    expect(parseSavedRecipe(recipe({ steps: ["image_query"] }))).toBeNull();
  });
});

describe("saved places", () => {
  it("keeps the stable id and the durable facts, not the session-specific ones", () => {
    const fields = toSavedPlaceFields(place());
    expect(fields).toEqual({
      place_id: "ChIJ-1",
      name: "Mediterranean Grill",
      address: "1 Main St",
      category: "Mediterranean restaurant",
      maps_url: "https://maps.example/1",
      website_url: "https://grill.example/",
      look_for: "A grilled chicken and rice bowl, sauce on the side.",
    });
    expect(JSON.stringify(fields)).not.toMatch(/distance|open_now|reason/);
  });

  it("reads an old/sparse record: only id and name are required", () => {
    expect(parseSavedPlaceRow({ place_id: "p", name: "Corner Cafe" })).toEqual({
      place_id: "p",
      name: "Corner Cafe",
      address: null,
      category: null,
      maps_url: null,
      website_url: null,
      look_for: null,
      saved_at: null,
    });
    expect(parseSavedPlaceRow({ name: "No id" })).toBeNull();
    expect(parseSavedPlaceRow({ place_id: "p" })).toBeNull();
    expect(parseSavedPlaceRow(null)).toBeNull();
  });

  it("drops links that aren't real http(s) URLs (they're rendered as hrefs)", () => {
    const p = parseSavedPlaceRow({ place_id: "p", name: "X", maps_url: "javascript:alert(1)", website_url: "data:text/html,x" });
    expect(p).toMatchObject({ maps_url: null, website_url: null });
    expect(parseSavedPlaceRow({ place_id: "p", name: "X", maps_url: "http://insecure.example" })?.maps_url).toBeNull();
  });
});

describe("re-checking against the CURRENT profile", () => {
  it("flags a newly-added allergy by name, without touching the recipe", () => {
    const r = recipe();
    const before = JSON.stringify(r);
    expect(recipeProfileFlags(r, { allergies: ["Peanuts"], dislikes: [] }).allergies).toEqual(["Peanuts"]);
    expect(JSON.stringify(r)).toBe(before);
  });

  it("flags dislikes separately and lightly; unrelated profile items flag nothing", () => {
    expect(recipeProfileFlags(recipe(), { allergies: [], dislikes: ["Scallions"] })).toEqual({ allergies: [], dislikes: ["Scallions"] });
    expect(recipeProfileFlags(recipe(), { allergies: ["Shellfish"], dislikes: ["Olives"] })).toEqual({ allergies: [], dislikes: [] });
    expect(recipeProfileFlags(recipe(), { allergies: [], dislikes: [] })).toEqual({ allergies: [], dislikes: [] });
  });

  it("withholds saved place guidance that now names a current allergen, keeps it otherwise", () => {
    expect(savedGuidanceIsAllowed("A peanut noodle bowl.", ["Peanuts"])).toBe(false);
    expect(savedGuidanceIsAllowed("A grilled chicken bowl.", ["Peanuts"])).toBe(true);
    expect(savedGuidanceIsAllowed(null, ["Peanuts"])).toBe(true);
    expect(savedGuidanceIsAllowed("A peanut noodle bowl.", [])).toBe(true);
  });
});
