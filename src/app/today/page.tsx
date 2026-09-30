// Server Component. Reads the profile so the form arrives already answered —
// the whole point of Today is that you can press the button immediately.

import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PROFILE } from "@/lib/options";
import { rememberedDefaults } from "@/lib/recommend/rememberedDefaults";
import { isRecentSession, parseStoredSession } from "@/lib/recommend/session";
import TodayForm from "./TodayForm";

export default async function TodayPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("default_cook_minutes, budget_per_meal_usd")
    .eq("id", user.id)
    .maybeSingle();

  // No profile row yet is a normal first-run state, not an error.
  const usualCookMinutes = toNumber(
    data?.default_cook_minutes,
    DEFAULT_PROFILE.default_cook_minutes,
  );
  const usualBudget = toNumber(
    data?.budget_per_meal_usd,
    DEFAULT_PROFILE.budget_per_meal_usd,
  );

  // Resume the most recent recommendation session — a plain read, so this
  // never calls the model — but only while it is recent (6 hours). A session
  // is temporary state for one eating decision; older than that, its
  // recommendations and its meal-specific inputs (foods on hand, craving) are
  // not restored, and the form starts from remembered defaults below. The row
  // itself is left alone as history.
  const { data: sessionRow } = await supabase
    .from("decision_sessions")
    .select("id, context, recommendations, chosen_index, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const restored = sessionRow && isRecentSession(sessionRow.created_at) ? parseStoredSession(sessionRow) : null;

  // Cook automatically has access to Kitchen staples (condiments/seasonings
  // only) — the user never re-enters them. Editing happens on Me; this is a
  // plain read, same as the profile fields above. Actual food for tonight
  // ("What do you have right now?") is never read back from a prior
  // session — it lives only in the form state / the context just submitted.
  const { data: staplesRows } = await supabase
    .from("kitchen_staples")
    .select("name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  const kitchenStaples = (staplesRows ?? []).map((r) => r.name as string);

  // If that session already had a recommendation chosen, it may also already
  // have feedback recorded — restore it so Today doesn't ask again.
  let initialFeedback: { id: string; didEat: boolean; note: string | null } | null = null;
  if (restored && restored.chosenIndex !== null) {
    const { data: feedbackRow } = await supabase
      .from("meal_feedback")
      .select("id, did_eat, note")
      .eq("session_id", restored.session.session_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (feedbackRow && typeof feedbackRow.id === "string" && typeof feedbackRow.did_eat === "boolean") {
      initialFeedback = {
        id: feedbackRow.id,
        didEat: feedbackRow.did_eat,
        note: typeof feedbackRow.note === "string" ? feedbackRow.note : null,
      };
    }
  }

  // What the chips start on: each mode's most recent settings, read from the
  // same decision_sessions history (contexts only — no recommendations). A new
  // user has no rows and gets the plain defaults. Defaults only; every chip
  // stays editable. See lib/recommend/rememberedDefaults.ts for what is and
  // isn't carried.
  const { data: recentRows } = await supabase
    .from("decision_sessions")
    .select("context")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const defaults = rememberedDefaults((recentRows ?? []).map((r) => r.context), usualCookMinutes);

  return (
    <AppShell title="Home" subtitle="Tell me about tonight.">
      <TodayForm
        defaults={defaults}
        usualBudget={usualBudget}
        kitchenStaples={kitchenStaples}
        initialSession={restored?.session ?? null}
        initialChosenIndex={restored?.chosenIndex ?? null}
        initialFeedback={initialFeedback}
      />
    </AppShell>
  );
}

/** numeric(6,2) comes back as a string from PostgREST, so coerce carefully. */
function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
