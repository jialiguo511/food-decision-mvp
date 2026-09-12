"use server";

// A Server Action: this function lives on the server but the browser can call
// it like a normal async function. Next.js generates the network call. There
// is no REST endpoint to write and no fetch() on the client.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileInput } from "@/lib/types";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveProfile(input: ProfileInput): Promise<SaveResult> {
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
    budget_per_meal_usd: clamp(input.budget_per_meal_usd, 1, 100),
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
