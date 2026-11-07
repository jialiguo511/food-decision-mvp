// Reads this user's place feedback. RLS already limits the table to their own
// rows; the user_id filter is explicit anyway. A failure degrades to "no
// feedback" — a hidden place reappearing is an annoyance, not a reason to fail
// a recommendation — and is logged.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLACE_PROVIDER, type PlaceFeedbackSets, toPlaceFeedbackSets } from "./feedback";

const MAX_ROWS = 1000;

export async function loadPlaceFeedback(supabase: SupabaseClient, userId: string): Promise<PlaceFeedbackSets> {
  try {
    const { data, error } = await supabase
      .from("place_feedback")
      .select("place_id, action")
      .eq("user_id", userId)
      .eq("provider", PLACE_PROVIDER)
      .limit(MAX_ROWS);
    if (error || !data) {
      if (error) console.error("[place_feedback] read failed", error);
      return toPlaceFeedbackSets([]);
    }
    return toPlaceFeedbackSets(data);
  } catch (error) {
    console.error("[place_feedback] read failed", error);
    return toPlaceFeedbackSets([]);
  }
}
