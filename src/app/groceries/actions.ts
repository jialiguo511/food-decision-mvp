"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Adds names to pantry_items, skipping ones already there (case-insensitive).
 * Insert-only — unlike profile/actions.ts's setPantryItems (which replaces
 * the whole list to match a TagInput's full state), this only ever adds, so a
 * partial "add selected suggestions" call can never delete existing pantry
 * items.
 */
export async function addPantryItems(names: string[]): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const wanted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).slice(0, 40);
  if (wanted.length === 0) return { ok: true };

  const { data: existing, error: readError } = await supabase
    .from("pantry_items")
    .select("name")
    .eq("user_id", user.id);
  if (readError) return { ok: false, error: readError.message };

  const existingNames = new Set((existing ?? []).map((row) => (row.name as string).toLowerCase()));
  const toInsert = wanted.filter((name) => !existingNames.has(name.toLowerCase()));

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from("pantry_items")
      .insert(toInsert.map((name) => ({ user_id: user.id, name })));
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/groceries");
  revalidatePath("/profile");
  revalidatePath("/today");
  return { ok: true };
}
