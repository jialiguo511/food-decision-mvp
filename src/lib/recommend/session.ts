// Turns a raw decision_sessions row into what Today needs to resume the flow
// without calling the model again — or null if the row is missing, not this
// user's, or unreadable. Reuses the same context and recommendation
// validators the live /api/recommend request already trusts, rather than a
// parallel check, so a corrupted or hand-edited row is discarded, not
// rendered.

import { mealContextSchema } from "./input";
import { storedRecommendationsSchema } from "./output";
import type { ActiveSession } from "../types";

export type RestoredSession = {
  session: ActiveSession;
  chosenIndex: 0 | 1 | 2 | null;
};

export function parseStoredSession(row: unknown): RestoredSession | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;

  const context = mealContextSchema.safeParse(row.context);
  const recommendations = storedRecommendationsSchema.safeParse(row.recommendations);
  if (!context.success || !recommendations.success) return null;

  const chosenIndex =
    row.chosen_index === 0 || row.chosen_index === 1 || row.chosen_index === 2
      ? row.chosen_index
      : null;

  return {
    session: {
      session_id: row.id,
      context: context.data,
      // storedRecommendationsSchema enforces length 3; zod's return type
      // doesn't carry that as a tuple, so this cast just restates it.
      recommendations: recommendations.data as ActiveSession["recommendations"],
    },
    chosenIndex,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
