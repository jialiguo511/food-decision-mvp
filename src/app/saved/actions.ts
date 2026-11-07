"use server";

// Server Actions for Saved. Saving reads the recommendation from the user's own
// decision_sessions row by (session, index) instead of trusting a payload from
// the browser, so what is stored is always the canonical recommendation the
// app itself generated. Every query is scoped to the signed-in user (and RLS
// enforces it again in the database).

import { PLACE_PROVIDER } from "@/lib/places/feedback";
import { storedRecommendationSchema } from "@/lib/recommend/output";
import { diagnosticLine, logSavedFailure, type SavedFailure } from "@/lib/saved/failure";
import { recipeKey, toSavedPlaceFields } from "@/lib/saved/saved";
import { createClient } from "@/lib/supabase/server";

/** `diagnostic` is only ever set outside production: the exact failing step,
 *  database code and likely cause, so a failure can be read off the screen
 *  during development. Production returns the simple `error` and nothing else. */
export type SaveResult = { ok: true } | { ok: false; error: string; diagnostic?: string };

const dev = () => process.env.NODE_ENV !== "production";
const COULDNT_SAVE = "Couldn't save that. Please try again.";

/** A failed step, logged on the server (structured) and shaped for the client. */
function failed(failure: SavedFailure, error = COULDNT_SAVE): SaveResult {
  return { ok: false, error, ...(dev() ? { diagnostic: diagnosticLine(failure) } : {}) };
}

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}
const SIGNED_OUT = { ok: false, error: "You are signed out. Please sign in again." } as const;

type Authed = NonNullable<Awaited<ReturnType<typeof authed>>>;

/** The recommendation at `index` of one of this user's sessions, validated —
 *  that card alone, so one card that no longer parses (an older shape) can't
 *  make the other two unsaveable. */
async function recommendationAt(
  { supabase, userId }: Authed,
  sessionId: string,
  index: number,
): Promise<{ rec: ReturnType<typeof storedRecommendationSchema.parse> } | { result: SaveResult }> {
  const notFound = (failure: SavedFailure): { result: SaveResult } => ({
    result: failed(failure, "That recommendation couldn't be found."),
  });
  if (typeof sessionId !== "string" || !sessionId || !Number.isInteger(index) || index < 0 || index > 2) {
    return notFound(logSavedFailure("read session", "session", "bad session id or index", { userId, sessionId, index }));
  }
  const { data, error } = await supabase
    .from("decision_sessions")
    .select("recommendations")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return notFound(logSavedFailure("read session", "session", error, { userId, sessionId, index }));
  if (!data) {
    return notFound(
      logSavedFailure("read session", "session", "No decision_sessions row with this id for the signed-in user (not generated, deleted, or another account).", {
        userId,
        sessionId,
        index,
      }),
    );
  }
  const card: unknown = Array.isArray(data.recommendations) ? data.recommendations[index] : undefined;
  if (card === undefined) {
    return notFound(logSavedFailure("read session", "session", `The session has no card at index ${index}.`, { userId, sessionId, index }));
  }
  // Same legacy shim as a restored session: rows from before every
  // recommendation carried a decision_mode are all Cook.
  const tagged = typeof card === "object" && card !== null && !("decision_mode" in card) ? { ...card, decision_mode: "cook" } : card;
  const parsed = storedRecommendationSchema.safeParse(tagged);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return notFound(
      logSavedFailure("parse stored recommendation", "session", `${issue?.path.join(".") || "(root)"}: ${issue?.message}`, { userId, sessionId, index }),
    );
  }
  return { rec: parsed.data };
}

/** Saves a Cook recipe or a nearby place. Idempotent: saving something already
 *  saved changes nothing (the original saved-at is kept), so a double tap — or
 *  a retry after a dropped response — is one row. */
export async function saveFromSession(sessionId: string, index: number): Promise<SaveResult> {
  const auth = await authed();
  if (!auth) return SIGNED_OUT;
  const { supabase, userId } = auth;

  const found = await recommendationAt(auth, sessionId, index);
  if ("result" in found) return found.result;
  const { rec } = found;

  if (rec.decision_mode === "cook") {
    const { error } = await supabase
      .from("saved_recipes")
      .upsert({ user_id: userId, recipe_key: recipeKey(rec), recipe: rec }, { onConflict: "user_id,recipe_key", ignoreDuplicates: true });
    if (error) return failed(logSavedFailure("save recipe", "recipe", error, { userId, sessionId, index }));
    return { ok: true };
  }

  if (rec.decision_mode === "nearby") {
    // A place the user marked "never again" can't be saved (only reachable from
    // a stale card) — the exclusion wins, deterministically.
    const { data: feedback, error: feedbackError } = await supabase
      .from("place_feedback")
      .select("action")
      .eq("user_id", userId)
      .eq("provider", PLACE_PROVIDER)
      .eq("place_id", rec.place_id)
      .maybeSingle();
    // Not fatal — a database without the feedback table can still save — but
    // not silent either.
    if (feedbackError) logSavedFailure("read place feedback", "place", feedbackError, { userId, sessionId, index });
    if (feedback?.action === "exclude") {
      return { ok: false, error: "You marked this place “not for me”, so it can't be saved." };
    }
    const { error } = await supabase
      .from("saved_places")
      .upsert(
        { user_id: userId, provider: PLACE_PROVIDER, ...toSavedPlaceFields(rec) },
        { onConflict: "user_id,provider,place_id", ignoreDuplicates: true },
      );
    if (error) return failed(logSavedFailure("save place", "place", error, { userId, sessionId, index }));
    return { ok: true };
  }

  return { ok: false, error: "Only recipes and places can be saved." };
}

/** Removes the recipe or place behind a recommendation card from Saved. */
export async function unsaveFromSession(sessionId: string, index: number): Promise<SaveResult> {
  const auth = await authed();
  if (!auth) return SIGNED_OUT;
  const { supabase, userId } = auth;

  const found = await recommendationAt(auth, sessionId, index);
  if ("result" in found) return found.result;
  const { rec } = found;

  if (rec.decision_mode === "cook") {
    const { error } = await supabase.from("saved_recipes").delete().eq("user_id", userId).eq("recipe_key", recipeKey(rec));
    return error ? failed(logSavedFailure("unsave recipe", "recipe", error, { userId, sessionId, index })) : { ok: true };
  }
  if (rec.decision_mode === "nearby") {
    const { error } = await supabase
      .from("saved_places")
      .delete()
      .eq("user_id", userId)
      .eq("provider", PLACE_PROVIDER)
      .eq("place_id", rec.place_id);
    return error ? failed(logSavedFailure("unsave place", "place", error, { userId, sessionId, index })) : { ok: true };
  }
  return { ok: false, error: "Only recipes and places can be saved." };
}

/** Remove from the Saved page itself. `id` is the row id (recipe) or the
 *  provider place id (place). */
export async function removeSaved(kind: "recipe" | "place", id: string): Promise<SaveResult> {
  if (typeof id !== "string" || !id || id.length > 300) return { ok: false, error: "That item couldn't be identified." };
  const auth = await authed();
  if (!auth) return SIGNED_OUT;
  const { supabase, userId } = auth;

  const { error } =
    kind === "recipe"
      ? await supabase.from("saved_recipes").delete().eq("user_id", userId).eq("id", id)
      : await supabase.from("saved_places").delete().eq("user_id", userId).eq("provider", PLACE_PROVIDER).eq("place_id", id);
  return error ? failed(logSavedFailure(`remove saved ${kind}`, kind, error, { userId })) : { ok: true };
}
