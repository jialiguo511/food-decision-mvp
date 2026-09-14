// Server Component. Reads the profile so the form arrives already answered —
// the whole point of Today is that you can press the button immediately.

import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PROFILE } from "@/lib/options";
import { parseStoredSession } from "@/lib/recommend/session";
import type { MealContext } from "@/lib/types";
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

  // Resume the most recent recommendation session, if any — a plain read, so
  // this never calls the model. No day-boundary/expiry logic yet: "most
  // recent" is the whole rule for this MVP.
  const { data: sessionRow } = await supabase
    .from("decision_sessions")
    .select("id, context, recommendations, chosen_index")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const restored = sessionRow ? parseStoredSession(sessionRow) : null;

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

  const initial: MealContext = restored?.session.context ?? {
    cook_minutes: usualCookMinutes,
    hunger: "normal",
    effort: "some",
    craving: null,
    ingredients_on_hand: [],
    // null means "whatever my profile says", so the budget card stays collapsed.
    budget_override_usd: null,
  };

  return (
    <AppShell title="Today" subtitle="Tell me about tonight.">
      <TodayForm
        initial={initial}
        usualBudget={usualBudget}
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
