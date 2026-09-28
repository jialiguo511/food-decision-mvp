"use server";

// A Server Action: this function lives on the server but the browser can call
// it like a normal async function. Next.js generates the network call. There
// is no REST endpoint to write and no fetch() on the client.

import { revalidatePath } from "next/cache";
import { CALORIE_TARGET } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import type { ProfileInput } from "@/lib/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveProfile(input: ProfileInput): Promise<SaveResult> {
  // Unlike the sliders, this is typed, so an out-of-range value is rejected
  // rather than clamped — silently saving a different number would mislead.
  const calories = input.daily_calorie_target_kcal;
  if (
    calories !== null &&
    (!Number.isInteger(calories) || calories < CALORIE_TARGET.min || calories > CALORIE_TARGET.max)
  ) {
    return {
      ok: false,
      error: `Daily calorie target should be between ${CALORIE_TARGET.min.toLocaleString("en-US")} and ${CALORIE_TARGET.max.toLocaleString("en-US")} kcal, or left blank.`,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  // Clamp to sane ranges. Never trust numbers that came from a browser.
  const row = {
    id: user.id,
    display_name: input.display_name?.trim() || null,
    goal: input.goal,
    protein_target_g: clamp(input.protein_target_g, 40, 300),
    daily_calorie_target_kcal: calories,
    // 0 is a valid budget — "no additional spending by default" — not an
    // error to clamp away.
    budget_per_meal_usd: clamp(input.budget_per_meal_usd, 0, 100),
    fridge_size: input.fridge_size,
    default_cook_minutes: clamp(input.default_cook_minutes, 5, 180),
    cuisines: dedupe(input.cuisines),
    dislikes: dedupe(input.dislikes),
    equipment: dedupe(input.equipment),
  };

  // upsert = insert if this is their first save, update otherwise.
  // This is why we don't need a database trigger to create profile rows.
  const { error } = await supabase.from("profiles").upsert(row);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).slice(0, 40);
}

/**
 * The whole Kitchen staples list, replaced in one call — the same "read the
 * array, write the array back" shape as saving cuisines/dislikes, except
 * kitchen_staples is a real table rather than a JSONB column, so this diffs
 * by name instead of overwriting a single row.
 *
 * Kitchen staples are condiments and seasonings only — persistent things the
 * user generally has, never actual food (no chicken, tofu, eggs, produce).
 * Actual food is "what do you have right now" on Today, entered fresh per
 * request and never saved here or anywhere else — see CLAUDE.md's canonical
 * availability rule and resolveRecommendationInput in lib/recommend/input.ts.
 */
export async function setKitchenStaples(names: string[]): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const wanted = dedupe(names);

  const { data: existing, error: readError } = await supabase
    .from("kitchen_staples")
    .select("id, name")
    .eq("user_id", user.id);
  if (readError) return { ok: false, error: readError.message };

  const existingNames = new Set((existing ?? []).map((row) => row.name as string));
  const wantedNames = new Set(wanted);

  const toInsert = wanted.filter((name) => !existingNames.has(name));
  const toDelete = (existing ?? []).filter((row) => !wantedNames.has(row.name as string)).map((row) => row.id);

  if (toDelete.length > 0) {
    const { error } = await supabase.from("kitchen_staples").delete().in("id", toDelete);
    if (error) return { ok: false, error: error.message };
  }
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("kitchen_staples")
      .insert(toInsert.map((name) => ({ user_id: user.id, name })));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath("/today");
  return { ok: true };
}
