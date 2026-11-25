// What Saved shows for one signed-in user — shared by the web page and the iOS app (GET
// /api/app/saved). Plain reads of two user-owned tables; nothing here calls the model or Places.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { PLACE_PROVIDER } from "@/lib/places/feedback";
import { loadPlaceFeedback } from "@/lib/places/feedbackQuery";
import { toProfileInput } from "@/lib/profile";
import { parseSavedPlaceRow, parseSavedRecipe, recipeProfileFlags, savedGuidanceIsAllowed } from "@/lib/saved/saved";
import type { SavedData, SavedTab } from "./savedTypes";

export { parseSavedTab, type SavedData, type SavedTab } from "./savedTypes";

export async function loadSaved(supabase: SupabaseClient, user: Pick<User, "id">, tab: SavedTab): Promise<SavedData> {
  // The CURRENT profile, for re-checking history against. A missing row is a normal state.
  const { data: profileRow } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profile = toProfileInput(profileRow);

  if (tab === "recipes") {
    const { data } = await supabase.from("saved_recipes").select("id, recipe, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200);
    const recipes = (data ?? []).flatMap((row) => {
      const recipe = parseSavedRecipe(row.recipe);
      return recipe && typeof row.id === "string"
        ? [{ id: row.id, recipe, savedAt: typeof row.created_at === "string" ? row.created_at : null, flags: recipeProfileFlags(recipe, profile) }]
        : [];
    });
    return { tab, recipes };
  }

  const { data } = await supabase
    .from("saved_places")
    .select("place_id, name, address, category, maps_url, website_url, look_for, created_at")
    .eq("user_id", user.id)
    .eq("provider", PLACE_PROVIDER)
    .order("created_at", { ascending: false })
    .limit(200);
  // A place the user said "never again" to is not shown, even if a stale row is still there.
  const { excluded } = await loadPlaceFeedback(supabase, user.id);
  const places = (data ?? []).flatMap((row) => {
    const place = parseSavedPlaceRow(row);
    return place && !excluded.has(place.place_id) ? [{ place, showGuidance: savedGuidanceIsAllowed(place.look_for, profile.allergies) }] : [];
  });
  return { tab, places };
}
