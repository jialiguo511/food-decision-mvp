// What of a set of recommendation cards is already in this user's Saved — read
// in bulk (at most one query per table, however many cards), so every card can
// render its saved state on first paint instead of asking one by one. Used for
// a freshly generated set (the recommend route) and a restored one (Home).
// Recipes match by content hash (recipeKey), places by provider place id, so a
// recipe or place saved in any earlier session is recognized in a later one.
// Saved is interest only; this changes nothing about what is recommended.
//
// A failure degrades to "nothing saved" (logged): a card showing "Save" for
// something already saved is harmless — saving is idempotent.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLACE_PROVIDER } from "../places/feedback";
import type { Recommendation, SavedState } from "../types";
import { recipeKey } from "./saved";

export const NOTHING_SAVED: SavedState = { recipeIndexes: [], placeIds: [] };

export async function loadSavedState(
  supabase: SupabaseClient,
  userId: string,
  recommendations: readonly Recommendation[],
): Promise<SavedState> {
  const cookKeys = recommendations.map((r) => (r.decision_mode === "cook" ? recipeKey(r) : null));
  const keys = cookKeys.filter((k): k is string => k !== null);
  const placeIds = recommendations.flatMap((r) => (r.decision_mode === "nearby" ? [r.place_id] : []));
  if (keys.length === 0 && placeIds.length === 0) return { recipeIndexes: [], placeIds: [] };

  try {
    const [recipes, places] = await Promise.all([
      keys.length > 0
        ? supabase.from("saved_recipes").select("recipe_key").eq("user_id", userId).in("recipe_key", keys)
        : null,
      placeIds.length > 0
        ? supabase.from("saved_places").select("place_id").eq("user_id", userId).eq("provider", PLACE_PROVIDER).in("place_id", placeIds)
        : null,
    ]);
    if (recipes?.error) console.error("[saved] recipe state read failed", recipes.error);
    if (places?.error) console.error("[saved] place state read failed", places.error);
    const savedKeys = new Set((recipes?.data ?? []).map((r) => r.recipe_key as string));
    const savedPlaces = new Set((places?.data ?? []).map((r) => r.place_id as string));
    return {
      recipeIndexes: cookKeys.flatMap((k, i) => (k !== null && savedKeys.has(k) ? [i] : [])),
      placeIds: placeIds.filter((id) => savedPlaces.has(id)),
    };
  } catch (error) {
    console.error("[saved] state read failed", error);
    return { recipeIndexes: [], placeIds: [] };
  }
}
