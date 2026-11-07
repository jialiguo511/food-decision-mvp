// Reads the existing decision_sessions / meal_feedback rows and reduces them to
// ChosenRow[] for summarizeBehavior. No new table, no writes. A failure here
// degrades to "no hints" — behavioral hints are a soft extra, never a reason
// to fail a recommendation.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationRole } from "../types";
import { summarizeBehavior, type BehaviorHints, type BehaviorScope, type ChosenRow } from "./behavior";

const LOOKBACK_DAYS = 60;
const MAX_ROWS = 60;
const ROLES: readonly string[] = ["best_match", "lowest_effort", "alternative"];

// Scalar JSON paths only (title / role / category of each of the three cards),
// so the heavy recommendation bodies are never transferred. The context is read
// for its mode and nearby flag alone — never ingredients_on_hand or craving.
const SELECT = [
  "id",
  "created_at",
  "chosen_index",
  "mode:context->>decision_mode",
  "nearby:context->>nearby",
  ...[0, 1, 2].flatMap((i) => [
    `t${i}:recommendations->${i}->>title`,
    `r${i}:recommendations->${i}->>role`,
    `c${i}:recommendations->${i}->>category`,
  ]),
].join(", ");

export async function loadBehaviorHints(
  supabase: SupabaseClient,
  userId: string,
  scope: BehaviorScope,
): Promise<BehaviorHints | null> {
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("decision_sessions")
      .select(SELECT)
      .eq("user_id", userId)
      .not("chosen_index", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error || !data) {
      if (error) console.error("[behavior] sessions read failed", error);
      return null;
    }
    const sessions = data as unknown as Record<string, unknown>[];
    const ids = sessions.map((s) => s.id).filter((id): id is string => typeof id === "string");
    if (ids.length === 0) return null;

    const { data: feedback, error: feedbackError } = await supabase
      .from("meal_feedback")
      .select("session_id, did_eat")
      .eq("user_id", userId)
      .in("session_id", ids);
    if (feedbackError) console.error("[behavior] feedback read failed", feedbackError);
    const didEat = new Map<string, boolean>();
    for (const f of feedback ?? []) {
      if (typeof f.session_id === "string" && typeof f.did_eat === "boolean") didEat.set(f.session_id, f.did_eat);
    }

    const rows = sessions.flatMap((s) => toChosenRow(s, didEat));
    return summarizeBehavior(rows, scope);
  } catch (error) {
    console.error("[behavior] failed", error);
    return null;
  }
}

/** One raw row → ChosenRow, or nothing if it isn't readable. Legacy rows have
 *  no decision_mode; they were all cook. */
export function toChosenRow(raw: Record<string, unknown>, didEat: ReadonlyMap<string, boolean>): ChosenRow[] {
  const index = raw.chosen_index;
  if ((index !== 0 && index !== 1 && index !== 2) || typeof raw.created_at !== "string" || typeof raw.id !== "string") {
    return [];
  }
  const mode = raw.mode ?? "cook";
  const scope: BehaviorScope | null =
    mode === "cook" || mode === "store_snack"
      ? mode
      : mode === "order"
        ? raw.nearby === "true"
          ? "nearby"
          : "order"
        : null;
  if (!scope) return [];
  const role = raw[`r${index}`];
  const title = raw[`t${index}`];
  const category = raw[`c${index}`];
  return [
    {
      created_at: raw.created_at,
      scope,
      role: typeof role === "string" && ROLES.includes(role) ? (role as RecommendationRole) : null,
      title: typeof title === "string" ? title : null,
      category: typeof category === "string" ? category : null,
      didEat: didEat.get(raw.id) ?? null,
    },
  ];
}
