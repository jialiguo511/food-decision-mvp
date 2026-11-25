// Saved's data shape and tab parser — client-safe (no server imports), shared by the loader
// (lib/app/saved.ts), the web page and the bundled iOS screen.
import type { recipeProfileFlags, SavedPlace } from "@/lib/saved/saved";
import type { CookRecommendation } from "@/lib/types";

export type SavedTab = "recipes" | "places";
export type SavedData =
  | { tab: "recipes"; recipes: { id: string; recipe: CookRecommendation; savedAt: string | null; flags: ReturnType<typeof recipeProfileFlags> }[] }
  | { tab: "places"; places: { place: SavedPlace; showGuidance: boolean }[] };

export function parseSavedTab(value: unknown): SavedTab {
  return value === "places" ? "places" : "recipes";
}
