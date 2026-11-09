"use server";

// Server Actions: the browser calls these like normal async functions.

import { revalidatePath } from "next/cache";
import { recordEvent } from "@/lib/events/record";
import { calculateNutritionTargets, targetsSignature } from "@/lib/nutrition";
import { NUTRITION_NUDGE_PREF, ONBOARDING_PREF } from "@/lib/onboarding";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import { toProfileFormValues } from "@/lib/profile";
import { mealTargetsFor, rankByNutritionFit } from "@/lib/recommend/nutritionFit";
import { parseStoredSession } from "@/lib/recommend/session";
import { loadSavedState } from "@/lib/saved/savedQuery";
import { actionForReason, isPlaceFeedbackReason, PLACE_PROVIDER } from "@/lib/places/feedback";
import { ALLERGIES_PREF, allergyStatus } from "@/lib/allergyStatus";
import { patchProfile, writeProfile } from "@/lib/profileStore";
import { createClient } from "@/lib/supabase/server";
import type { PlaceFeedbackAction, PlaceFeedbackReason, ProfileFormValues, Recommendation, SavedState } from "@/lib/types";

export type ChooseResult =
  | { ok: true; chosenIndex: 0 | 1 | 2 }
  | { ok: false; error: string };

/**
 * Records which of the three recommendations the user picked, on the
 * decision_sessions row /api/recommend already created for that request.
 *
 * Guarded so a session can only be chosen once: the update only applies
 * while chosen_index is still null. A repeat of the same choice (a resent
 * request, a double click that slipped past the client-side guard) lands on
 * "already chosen with this index" and is reported back as success rather
 * than an error — the end state the caller wanted is already true.
 */
export async function chooseRecommendation(
  sessionId: string,
  chosenIndex: 0 | 1 | 2,
): Promise<ChooseResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const { data, error } = await supabase
    .from("decision_sessions")
    .update({ chosen_index: chosenIndex })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .is("chosen_index", null)
    .select("chosen_index")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (data) {
    await noteChoice(supabase, user.id, sessionId, chosenIndex);
    return { ok: true, chosenIndex: data.chosen_index as 0 | 1 | 2 };
  }

  // No row was updated: either this session isn't found/owned, or it already
  // has a choice recorded. Read it to tell those apart.
  const { data: existing, error: readError } = await supabase
    .from("decision_sessions")
    .select("chosen_index")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (!existing) return { ok: false, error: "That recommendation session could not be found." };
  if (existing.chosen_index === chosenIndex) return { ok: true, chosenIndex };
  return { ok: false, error: "A different option was already chosen for this session." };
}

export type FeedbackResult =
  | { ok: true; id: string; didEat: boolean; note: string | null }
  | { ok: false; error: string };

/**
 * The core loop's last step: did the user actually eat the meal they chose?
 * Writes to the existing meal_feedback table, linked back to the same
 * decision_sessions row chooseRecommendation wrote chosen_index onto.
 *
 * Idempotent rather than guarded by a database constraint: meal_feedback has
 * no unique constraint on session_id, so a repeat call (double click, a
 * resent request) first looks for a row already recorded for this session
 * and returns that instead of inserting a second one. The realistic failure
 * mode this protects against is a duplicate click, not a concurrent write
 * from two devices, so a read-then-insert is enough here — the client also
 * guards with a ref, the same pattern used for choosing a recommendation.
 */
export async function recordMealFeedback(
  sessionId: string,
  mealTitle: string,
  didEat: boolean,
): Promise<FeedbackResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const { data: existing, error: readError } = await supabase
    .from("meal_feedback")
    .select("id, did_eat, note")
    .eq("session_id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (existing) return { ok: true, id: existing.id, didEat: existing.did_eat, note: existing.note };

  const { data, error } = await supabase
    .from("meal_feedback")
    .insert({ user_id: user.id, session_id: sessionId, meal_title: mealTitle, did_eat: didEat })
    .select("id, did_eat, note")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't save your answer." };
  return { ok: true, id: data.id, didEat: data.did_eat, note: data.note };
}

export type SetNoteResult = { ok: true } | { ok: false; error: string };

/**
 * The optional second question — a rejection reason when they didn't eat it,
 * or "would eat again" when they did. Both live in the same `note` column;
 * which one it means is implied by that row's did_eat. Write-once, guarded
 * the same way as chosen_index: only applies while note is still null, so a
 * duplicate call is a harmless no-op rather than overwriting an answer.
 */
export async function setMealFeedbackNote(feedbackId: string, note: string): Promise<SetNoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const { error } = await supabase
    .from("meal_feedback")
    .update({ note })
    .eq("id", feedbackId)
    .eq("user_id", user.id)
    .is("note", null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type PlaceFeedbackResult =
  | { ok: true; action: PlaceFeedbackAction; reason: PlaceFeedbackReason; removedFromSaved: boolean }
  | { ok: false; error: string };

/**
 * "Not for me" on a nearby place card. Stored per user, keyed by the
 * provider's place id (never the name), as the user's own opinion — not a fact
 * about the place. The action (hide vs. rank lower) is derived here from the
 * reason, never taken from the client. One row per place; the latest answer
 * replaces the earlier one. Skipping a card never calls this.
 */
export async function recordPlaceFeedback(placeId: string, reason: string): Promise<PlaceFeedbackResult> {
  if (typeof placeId !== "string" || placeId.length === 0 || placeId.length > 300) {
    return { ok: false, error: "That place couldn't be identified." };
  }
  if (!isPlaceFeedbackReason(reason)) return { ok: false, error: "Unknown reason." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const action = actionForReason(reason);
  const { error } = await supabase.from("place_feedback").upsert(
    { user_id: user.id, provider: PLACE_PROVIDER, place_id: placeId, action, reason },
    { onConflict: "user_id,provider,place_id" },
  );
  if (error) return { ok: false, error: error.message };

  // A hard exclusion outranks a save: a place the user never wants suggested
  // leaves Saved (soft downranking leaves it alone). Undoing the exclusion
  // later does not bring the save back.
  let removedFromSaved = false;
  if (action === "exclude") {
    const { data: removed, error: removeError } = await supabase
      .from("saved_places")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", PLACE_PROVIDER)
      .eq("place_id", placeId)
      .select("place_id");
    // The exclusion is already stored and the Saved page hides excluded places
    // regardless, so a failure here is logged, not surfaced.
    if (removeError) console.error("[place_feedback] couldn't remove excluded place from Saved", removeError);
    removedFromSaved = (removed?.length ?? 0) > 0;
  }
  return { ok: true, action, reason, removedFromSaved };
}

/** Undo: forgets this user's feedback about one place. */
export async function clearPlaceFeedback(placeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof placeId !== "string" || placeId.length === 0 || placeId.length > 300) {
    return { ok: false, error: "That place couldn't be identified." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const { error } = await supabase
    .from("place_feedback")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", PLACE_PROVIDER)
    .eq("place_id", placeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type OnboardingResult = { ok: true } | { ok: false; error: string };

/**
 * Saves like the Me page's "Save profile" — the same writeProfile, no second
 * store — and records `pref` in profiles.prefs so the step it belongs to is
 * never offered again. `values` starts from the user's current Profile, so
 * anything the step doesn't ask about is written back unchanged (and a field
 * the user never set stays unset). Other prefs keys are preserved.
 */
async function saveProfileWithPref(values: ProfileFormValues, prefs: Record<string, unknown>): Promise<OnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const result = await writeProfile(supabase, user.id, values, prefs);
  if (result.ok) {
    revalidatePath("/profile");
    revalidatePath("/today");
  }
  return result;
}

/** First-run setup (allergies, foods you don't eat): finished or skipped, it is
 *  recorded, so setup is offered once. */
export async function completeOnboarding(values: ProfileFormValues, options: { noKnownAllergies?: boolean } = {}): Promise<OnboardingResult> {
  const now = new Date().toISOString();
  // Saying "no known allergies" is an explicit answer; skipping the question is not — it
  // stays unset (lib/allergyStatus.ts). Listing one is recorded by the Profile write itself.
  return saveProfileWithPref(values, { [ONBOARDING_PREF]: now, ...(options.noKnownAllergies === true ? { [ALLERGIES_PREF]: now } : {}) });
}

/**
 * "I have no known allergies", said from Me or from the note on the results. Writes the
 * answer and nothing else of the Profile that the person didn't set (patchProfile reads
 * the stored row through the provenance rules). An existing list is never emptied by this:
 * if allergies are listed, it does nothing.
 */
export async function confirmNoAllergies(): Promise<OnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };
  const { data: row, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) return { ok: false, error: "Couldn't save that. Please try again." };
  if (allergyStatus(row) === "listed") return { ok: true };
  const result = await patchProfile(supabase, user.id, {}, { [ALLERGIES_PREF]: new Date().toISOString() });
  if (result.ok) {
    revalidatePath("/profile");
    revalidatePath("/today");
  }
  return result;
}

/** The optional "better portion and protein suggestions" step, finished. */
export async function completeNutritionStep(values: ProfileFormValues): Promise<OnboardingResult> {
  return saveProfileWithPref(values, { [NUTRITION_NUDGE_PREF]: new Date().toISOString() });
}

/**
 * "Not now" on the nutrition step: records only the dismissal and writes no
 * Profile field, so declining can never overwrite what the user has stored.
 * With no profile row yet there is nothing to record against; the step simply
 * stays available.
 */
export async function dismissNutritionStep(): Promise<OnboardingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const { data: existing, error: readError } = await supabase.from("profiles").select("prefs").eq("id", user.id).maybeSingle();
  if (readError) return { ok: false, error: "Couldn't save that. Please try again." };
  if (!existing) return { ok: true };
  const prefs = existing.prefs && typeof existing.prefs === "object" ? (existing.prefs as Record<string, unknown>) : {};

  const { error } = await supabase
    .from("profiles")
    .update({ prefs: { ...prefs, [NUTRITION_NUDGE_PREF]: new Date().toISOString() } })
    .eq("id", user.id);
  if (error) {
    console.error("[onboarding] couldn't record dismissal", error);
    return { ok: false, error: "Couldn't save that. Please try again." };
  }
  revalidatePath("/today");
  return { ok: true };
}

export type RescoreResult =
  | {
      ok: true;
      /** The signature of the user's CURRENT targets (null when nothing
       *  personal is behind them) — the caller records it so it asks once. */
      targetsSig: string | null;
      /** false = nothing to re-score (a pick was already made, nearby places
       *  carry no nutrition estimates, or no personal targets exist). */
      rescored: false;
    }
  | {
      ok: true;
      targetsSig: string | null;
      rescored: true;
      /** Whether the order of the cards actually changed. */
      changed: boolean;
      recommendations: Recommendation[];
      saved: SavedState;
    }
  | { ok: false; error: string };

/**
 * The user's nutrition targets changed while a set of cards was on screen:
 * re-score THOSE cards against the new targets (deterministic, no model, no
 * network beyond the database) and re-order them, so the new details have a
 * visible effect without another slow generation. The re-ordered set is stored
 * on the same session row — indexes (Choose, Save) always refer to the stored
 * order — and returned. Skipped once a card has been picked: a choice is never
 * shuffled out from under the user.
 */
export async function rescoreSession(sessionId: string): Promise<RescoreResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again." };

  const [{ data: profileRow, error: profileError }, { data: sessionRow, error: sessionError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("decision_sessions")
      .select("id, context, recommendations, chosen_index, created_at")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (profileError || sessionError) {
    console.error("[rescore] read failed", { profile: profileError?.code, session: sessionError?.code });
    return { ok: false, error: "Couldn't re-check your picks." };
  }
  const targets = calculateNutritionTargets(toProfileFormValues(profileRow), DEFAULT_PROTEIN_TARGET_G);
  const targetsSig = targets.personalized ? targetsSignature(targets) : null;

  const restored = sessionRow ? parseStoredSession(sessionRow) : null;
  if (!restored) return { ok: false, error: "That recommendation session could not be found." };
  if (restored.chosenIndex !== null) return { ok: true, targetsSig, rescored: false };

  const { context, recommendations } = restored.session;
  // A cross-way set mixes meals and snacks, so no single per-serving range applies to it.
  if (context.decision_mode === "open") return { ok: true, targetsSig, rescored: false };
  const kind = context.decision_mode === "store_snack" ? "snack" : "meal";
  const nearby = context.decision_mode === "order" && context.nearby === true;
  const meal = nearby ? null : mealTargetsFor(targets, context.hunger, kind);
  if (!meal) return { ok: true, targetsSig, rescored: false };

  const ranked = rankByNutritionFit(recommendations, meal);
  if (ranked.changed) {
    const { error } = await supabase
      .from("decision_sessions")
      .update({ recommendations: ranked.recommendations })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .is("chosen_index", null);
    if (error) {
      console.error("[rescore] couldn't store the re-ordered set", { code: error.code, message: error.message });
      return { ok: false, error: "Couldn't re-check your picks." };
    }
  }
  const saved = await loadSavedState(supabase, user.id, ranked.recommendations);
  return { ok: true, targetsSig, rescored: true, changed: ranked.changed, recommendations: ranked.recommendations, saved };
}

/** The `choice_made` event: which kind of decision and which role was picked —
 *  read from the session's own row, so it says nothing the row doesn't already
 *  hold. A note, never part of the choice: any failure is dropped. */
async function noteChoice(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, sessionId: string, index: 0 | 1 | 2) {
  try {
    const { data } = await supabase.from("decision_sessions").select("recommendations").eq("id", sessionId).eq("user_id", userId).maybeSingle();
    const card = Array.isArray(data?.recommendations) ? (data.recommendations[index] as { decision_mode?: unknown; role?: unknown } | undefined) : undefined;
    const mode = card?.decision_mode === "nearby" ? "nearby" : card?.decision_mode === "order" || card?.decision_mode === "store_snack" ? card.decision_mode : "cook";
    const role = card?.role;
    if (role !== "best_match" && role !== "lowest_effort" && role !== "alternative") return;
    await recordEvent(supabase, userId, { name: "choice_made", props: { mode, role } });
  } catch {
    // never part of the choice
  }
}
