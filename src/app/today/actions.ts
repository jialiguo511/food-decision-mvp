"use server";

// Server Actions: the browser calls these like normal async functions.

import { createClient } from "@/lib/supabase/server";

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
  if (data) return { ok: true, chosenIndex: data.chosen_index as 0 | 1 | 2 };

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
