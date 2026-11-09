// The one place a Profile is written. Every save — the Me form, first-run
// setup, the nutrition step, the Cook equipment question — goes through here,
// so they all validate the same way and all record provenance the same way
// (see profileProvenance.ts): only values the user set are stored as theirs.
// Server-only: takes the caller's Supabase client, which carries the session.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeProfilePrefs, toProfileFormValues, validateProfileForm } from "./profile";
import type { ProfileFormValues } from "./types";

export type WriteResult = { ok: true } | { ok: false; error: string };

/** Validates `values` and upserts them, merging `extraPrefs` (e.g. "setup
 *  done") over the existing prefs. Other prefs keys are preserved. */
export async function writeProfile(
  supabase: SupabaseClient,
  userId: string,
  values: ProfileFormValues,
  extraPrefs: Record<string, unknown> = {},
): Promise<WriteResult> {
  const validated = validateProfileForm(values);
  if (!validated.ok) return validated;

  const { data: existing, error: readError } = await supabase.from("profiles").select("prefs").eq("id", userId).maybeSingle();
  if (readError) {
    console.error("[profile] couldn't read prefs before saving", { code: readError.code });
    return { ok: false, error: "Couldn't save that. Please try again." };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...validated.row, prefs: mergeProfilePrefs(existing?.prefs, validated, extraPrefs) });
  if (error) {
    // No `details`: for a failed check constraint Postgres puts the whole failing ROW there — age, weight, allergies.
    console.error("[profile] couldn't save", { code: error.code });
    return { ok: false, error: "Couldn't save that. Please try again." };
  }
  return { ok: true };
}

/** Changes some fields of the stored Profile and leaves the rest as they are —
 *  the stored row is read back through the same provenance rules, so a field
 *  the user never set stays unset instead of being written back as a default. */
export async function patchProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<ProfileFormValues>,
  extraPrefs: Record<string, unknown> = {},
): Promise<WriteResult> {
  const { data: row, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("[profile] couldn't read before patching", { code: error.code });
    return { ok: false, error: "Couldn't save that. Please try again." };
  }
  return writeProfile(supabase, userId, { ...toProfileFormValues(row), ...patch }, extraPrefs);
}
