import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { place, recipe } from "@/test/savedFixtures";
import type { Recommendation } from "../types";
import { loadSavedState } from "./savedQuery";
import { recipeKey } from "./saved";

let db = createFakeDb();
const client = (user: string) => db.clientFor(user) as never;

const other = recipe({ title: "Sesame Noodle Bowl" });
const cards: Recommendation[] = [recipe(), other, recipe({ title: "Garlic Rice", steps: ["Cook rice."] })];

beforeEach(() => {
  db = createFakeDb();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadSavedState — saved state for a whole set of cards", () => {
  it("a fresh user has nothing saved, and an empty set costs no queries", async () => {
    expect(await loadSavedState(client("u1"), "u1", cards)).toEqual({ recipeIndexes: [], placeIds: [] });
    expect(await loadSavedState(client("u1"), "u1", [])).toEqual({ recipeIndexes: [], placeIds: [] });
  });

  it("recognizes a recipe saved earlier by its content, even from a different generation", async () => {
    db.seed("saved_recipes", { user_id: "u1", recipe_key: recipeKey(recipe()), recipe: recipe() });
    // A later session produced the same dish, worded differently.
    const later: Recommendation[] = [other, recipe({ reason: "New wording.", estimated_calories: 610, role: "alternative" })];
    expect((await loadSavedState(client("u1"), "u1", later)).recipeIndexes).toEqual([1]);
  });

  it("recognizes saved places by provider place id", async () => {
    db.seed("saved_places", { user_id: "u1", provider: "google_places", place_id: "ChIJ-1", name: "A" });
    const set: Recommendation[] = [place({ place_id: "ChIJ-1" }), place({ place_id: "ChIJ-2" }), place({ place_id: "ChIJ-9", title: "A" })];
    expect((await loadSavedState(client("u1"), "u1", set)).placeIds).toEqual(["ChIJ-1"]);
  });

  it("is batched: at most one query per table, however many cards", async () => {
    db.seed("saved_recipes", { user_id: "u1", recipe_key: recipeKey(recipe()), recipe: recipe() });
    const before = db.queries.length;
    await loadSavedState(client("u1"), "u1", cards);
    expect(db.queries.slice(before)).toEqual(["saved_recipes"]);
    const mixed = [...cards.slice(0, 2), place()];
    const again = db.queries.length;
    await loadSavedState(client("u1"), "u1", mixed);
    expect(db.queries.slice(again).sort()).toEqual(["saved_places", "saved_recipes"]);
  });

  it("only counts this user's saves", async () => {
    db.seed("saved_recipes", { user_id: "u2", recipe_key: recipeKey(recipe()), recipe: recipe() });
    db.seed("saved_places", { user_id: "u2", provider: "google_places", place_id: "ChIJ-1", name: "A" });
    expect(await loadSavedState(client("u1"), "u1", [recipe(), place({ place_id: "ChIJ-1" })])).toEqual({ recipeIndexes: [], placeIds: [] });
  });

  it("degrades to nothing saved (not a failure) if the read throws", async () => {
    const broken = { from: () => { throw new Error("db down"); } } as never;
    expect(await loadSavedState(broken, "u1", cards)).toEqual({ recipeIndexes: [], placeIds: [] });
  });
});
