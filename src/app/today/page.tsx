// Server Component. Reads everything Home needs so its questions arrive already
// answered — a returning user can go straight to the mode's one button.

import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calculateNutritionTargets, targetsSignature } from "@/lib/nutrition";
import { profileStage } from "@/lib/onboarding";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import { toProfileFormValues } from "@/lib/profile";
import { rememberedDefaults } from "@/lib/recommend/rememberedDefaults";
import { isRecentSession, parseStoredSession } from "@/lib/recommend/session";
import { PLACE_PROVIDER, toPlaceFeedbackSets } from "@/lib/places/feedback";
import { loadSavedState } from "@/lib/saved/savedQuery";
import type { PlaceFeedbackState } from "./PlaceFeedback";
import HomeFlow from "./HomeFlow";

export default async function TodayPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const user = await requireUser();
  const supabase = await createClient();

  // Four independent reads, together — one round trip's wait instead of four
  // (they used to run one after another on every open of Home). The reads that
  // depend on the restored session follow, also together, further down.
  const [{ data }, { data: sessionRow }, { data: staplesRows }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    // The most recent recommendation session — see below for the 6 h rule.
    supabase
      .from("decision_sessions")
      .select("id, context, recommendations, chosen_index, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Kitchen staples: condiments/seasonings only, never actual food.
    supabase.from("kitchen_staples").select("name").eq("user_id", user.id).order("created_at", { ascending: true }),
    // Each mode's most recent settings, from the same history (contexts only —
    // no recommendations). A new user has no rows and gets the plain defaults.
    supabase.from("decision_sessions").select("context").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);

  // No profile row yet is a normal first-run state, not an error. What the
  // Profile says is read through its provenance rules: a value the user never
  // set is null here, never a database default (see lib/profileProvenance.ts).
  const profileValues = toProfileFormValues(data);
  // What one meal should roughly be, for this person — the same calculation the
  // recommender and Me use (lib/nutrition.ts). `targetsSig` changing under a set
  // of cards on screen is what makes Home re-score them.
  const targets = calculateNutritionTargets(profileValues, DEFAULT_PROTEIN_TARGET_G);
  const targetsSig = targets.personalized ? targetsSignature(targets) : null;

  // Resume the most recent recommendation session — a plain read, so this
  // never calls the model — but only while it is recent (6 hours). A session
  // is temporary state for one eating decision; older than that, its
  // recommendations and its meal-specific inputs (foods on hand, craving) are
  // not restored, and the form starts from remembered defaults below. The row
  // itself is left alone as history.
  const restored = sessionRow && isRecentSession(sessionRow.created_at) ? parseStoredSession(sessionRow) : null;

  // Cook automatically has access to Kitchen staples (condiments/seasonings
  // only) — the user never re-enters them. Editing happens on Me; this is a
  // plain read, same as the profile fields above. Actual food for tonight
  // ("What do you have right now?") is never read back from a prior
  // session — it lives only in the form state / the context just submitted.
  const kitchenStaples = (staplesRows ?? []).map((r) => r.name as string);

  // Three reads that depend on the restored session, run together: any
  // feedback already recorded for the pick (so Today doesn't ask again), the
  // user's own "not for me" answers for the places in a nearby set (so a reload
  // shows "Noted"), and what's already in Saved for the set (a fresh generation
  // gets the same from /api/recommend). All plain reads, nothing for a user
  // with no restored session.
  const [initialFeedback, initialPlaceFeedback, saved] = await Promise.all([
    (async () => {
      if (!restored || restored.chosenIndex === null) return null;
      const { data: feedbackRow } = await supabase
        .from("meal_feedback")
        .select("id, did_eat, note")
        .eq("session_id", restored.session.session_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (feedbackRow && typeof feedbackRow.id === "string" && typeof feedbackRow.did_eat === "boolean") {
        return { id: feedbackRow.id, didEat: feedbackRow.did_eat, note: typeof feedbackRow.note === "string" ? feedbackRow.note : null };
      }
      return null;
    })(),
    (async () => {
      const byPlace: Record<string, PlaceFeedbackState> = {};
      const ids = restored?.session.recommendations.flatMap((r) => (r.decision_mode === "nearby" ? [r.place_id] : [])) ?? [];
      if (ids.length === 0) return byPlace;
      const { data: rows } = await supabase
        .from("place_feedback")
        .select("place_id, action")
        .eq("user_id", user.id)
        .eq("provider", PLACE_PROVIDER)
        .in("place_id", ids);
      const { excluded, downranked } = toPlaceFeedbackSets(rows ?? []);
      for (const id of excluded) byPlace[id] = { action: "exclude" };
      for (const id of downranked) byPlace[id] = { action: "downrank" };
      return byPlace;
    })(),
    restored ? loadSavedState(supabase, user.id, restored.session.recommendations) : Promise.resolve(undefined),
  ]);

  // A restored set was made under the targets in force when it was generated,
  // unless the Profile has been edited since — then its signature stays unknown
  // and Home re-scores it once against the current targets.
  const profileEditedAfter =
    typeof data?.updated_at === "string" && typeof sessionRow?.created_at === "string" && Date.parse(data.updated_at) > Date.parse(sessionRow.created_at);
  const restoredSession = restored
    ? {
        ...restored.session,
        saved,
        ...(targetsSig && !profileEditedAfter ? { targets_sig: targetsSig } : {}),
      }
    : null;

  // What the chips start on: each mode's most recent settings, read from the
  // same decision_sessions history (contexts only — no recommendations). A new
  // user has no rows and gets the plain defaults. Defaults only; every chip
  // stays editable. See lib/recommend/rememberedDefaults.ts for what is and
  // isn't carried.
  const defaults = rememberedDefaults((recentRows ?? []).map((r) => r.context), {
    cookMinutes: profileValues.default_cook_minutes,
    budget: profileValues.budget_per_meal_usd,
  });

  // Where the user is with their Profile — independent of which modes they
  // have used (that is `defaults.remembered`, from their sessions). See
  // profileStage. "new" gets first-run setup, offered once and never a gate;
  // "partial" gets the optional nutrition step after seeing results;
  // "complete" gets neither. Both write into this same profiles row.
  const stage = profileStage(data);
  const avoidsFoods = profileValues.allergies.length > 0 || profileValues.dislikes.length > 0;

  return (
    <AppShell>
      <HomeFlow
        ownerId={user.id}
        defaults={defaults}
        equipmentKnown={profileValues.equipment !== null}
        kitchenStaples={kitchenStaples}
        avoidsFoods={avoidsFoods}
        nutritionTargets={targets}
        targetsSig={targetsSig}
        initialSession={restoredSession}
        initialChosenIndex={restored?.chosenIndex ?? null}
        initialFeedback={initialFeedback}
        initialPlaceFeedback={initialPlaceFeedback}
        onboardingProfile={stage === "new" ? profileValues : null}
        nutritionProfile={stage === "partial" ? profileValues : null}
      />
    </AppShell>
  );
}
