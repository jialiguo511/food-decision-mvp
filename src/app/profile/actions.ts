"use server";

// A Server Action: this function lives on the server but the browser can call
// it like a normal async function. Next.js generates the network call. There
// is no REST endpoint to write and no fetch() on the client.

import { revalidatePath } from "next/cache";
import { EQUIPMENT } from "@/lib/options";
import { patchProfile, writeProfile } from "@/lib/profileStore";
import { createClient } from "@/lib/supabase/server";
import type { ProfileFormValues } from "@/lib/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveProfile(input: ProfileFormValues): Promise<SaveResult> {
  // Typed numbers are rejected when out of range rather than clamped, and the
  // allergy/dislike lists are normalized and kept disjoint — see
  // lib/profile.ts → validateProfileForm. Only what the user set is stored as
  // theirs — see lib/profileProvenance.ts.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const result = await writeProfile(supabase, user.id, input);
  if (result.ok) revalidatePath("/profile");
  return result;
}

/**
 * "What can you cook with?" — saved the first time someone cooks, editable in
 * Me. Only the equipment changes; everything else stays as it was (including
 * staying unset). Unknown items are dropped; an empty list is rejected rather
 * than stored as "no appliances", which is a different answer
 * ("No cooking at all").
 */
export async function saveEquipment(items: string[]): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const equipment = Array.isArray(items) ? items.filter((item): item is string => typeof item === "string" && (EQUIPMENT as readonly string[]).includes(item)) : [];
  if (equipment.length === 0) return { ok: false, error: "Pick at least one." };

  const result = await patchProfile(supabase, user.id, { equipment });
  if (result.ok) {
    revalidatePath("/profile");
    revalidatePath("/today");
  }
  return result;
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
