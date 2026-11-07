// "Saved" — things the user wants to come back to. Explicit interest only:
// not "picked" (chosen for a meal), not "ate" or "loved", and nothing here
// feeds recommendation ranking. Two kinds, stored separately because their
// identities differ:
//   recipes — a Cook recommendation, stored in its canonical shape; identity is
//             a hash of its content, since the model gives recipes no id.
//   places  — a nearby place; identity is the provider's place id (never the
//             name), so saving the same place from any session is one save.
// Pure except recipeKey (node:crypto) — import this from server code only.

import { createHash } from "node:crypto";
import { findAllergenMentions, findFoodTermMentions } from "../foodTerms";
import { PLACE_PROVIDER } from "../places/feedback";
import { storedRecommendationSchema, stripLeakedImageQueryStep } from "../recommend/output";
import type { CookRecommendation, NearbyRecommendation } from "../types";

export const SAVED_PROVIDER = PLACE_PROVIDER;

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Stable identity of a recipe's *content*: title, ingredients and steps.
 *  Everything that varies between generations of the same dish (the reason
 *  text, estimates, image query, role) is left out, so saving an identical
 *  recipe again is the same save, while a real variant is a new one. */
export function recipeKey(recipe: CookRecommendation): string {
  const canonical = JSON.stringify({
    title: norm(recipe.title),
    ingredients: [...new Set([...recipe.ingredients_on_hand, ...recipe.ingredients_needed].map(norm))].sort(),
    steps: recipe.steps.map(norm),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** A stored recipe → the canonical CookRecommendation, or null when it isn't
 *  one (corrupt, hand-edited, another mode). Older shapes missing newer
 *  optional fields get their defaults, exactly like a restored session. */
export function parseSavedRecipe(value: unknown): CookRecommendation | null {
  const parsed = storedRecommendationSchema.safeParse(value);
  if (!parsed.success || parsed.data.decision_mode !== "cook") return null;
  const steps = stripLeakedImageQueryStep(parsed.data.steps);
  return steps.length > 0 ? { ...parsed.data, steps } : null;
}

export type SavedPlaceFields = {
  place_id: string;
  name: string;
  address: string | null;
  category: string | null;
  maps_url: string | null;
  website_url: string | null;
  /** The "what to look for" guidance as it was when saved. */
  look_for: string | null;
};

/** What we keep of a nearby recommendation. Distance, open-now and the
 *  session-specific reason are not kept: they were true for one search. */
export function toSavedPlaceFields(rec: NearbyRecommendation): SavedPlaceFields {
  return {
    place_id: rec.place_id,
    name: rec.title,
    address: rec.address,
    category: rec.category,
    maps_url: rec.maps_url,
    website_url: rec.website_url,
    look_for: rec.look_for,
  };
}

export type SavedPlace = SavedPlaceFields & { saved_at: string | null };

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const httpUrl = (v: unknown, httpsOnly: boolean) => {
  if (typeof v !== "string") return null;
  try {
    const { protocol } = new URL(v);
    return protocol === "https:" || (!httpsOnly && protocol === "http:") ? v : null;
  } catch {
    return null;
  }
};

/** A saved_places row, read leniently: only the place id and name are
 *  required; every optional field that's missing or unsafe just reads as null
 *  (links are only kept when they are real http(s) URLs). */
export function parseSavedPlaceRow(row: unknown): SavedPlace | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const place_id = text(r.place_id);
  const name = text(r.name);
  if (!place_id || !name) return null;
  return {
    place_id,
    name,
    address: text(r.address),
    category: text(r.category),
    maps_url: httpUrl(r.maps_url, true),
    website_url: httpUrl(r.website_url, false),
    look_for: text(r.look_for),
    saved_at: text(r.created_at),
  };
}

/** What a saved recipe now runs into in the user's CURRENT profile. A literal
 *  name match against the recipe's title, ingredients and steps — the same
 *  limits as the nearby allergy check (no aliases, no hidden ingredients), so
 *  an empty result never means "safe". The recipe itself is never altered. */
export function recipeProfileFlags(
  recipe: CookRecommendation,
  profile: { allergies: readonly string[]; dislikes: readonly string[] },
): { allergies: string[]; dislikes: string[] } {
  const haystack = [recipe.title, ...recipe.ingredients_on_hand, ...recipe.ingredients_needed, ...recipe.steps].join("\n");
  return {
    allergies: findAllergenMentions(haystack, profile.allergies),
    dislikes: findFoodTermMentions(haystack, profile.dislikes),
  };
}

/** Saved guidance was written under the allergies of that day; show it only if
 *  it still names none of the current ones. */
export function savedGuidanceIsAllowed(lookFor: string | null, allergies: readonly string[]): boolean {
  return lookFor === null || findAllergenMentions(lookFor, allergies).length === 0;
}
