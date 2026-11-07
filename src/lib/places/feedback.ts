// Per-user feedback about a specific real place: what it means for
// recommendations, and how stored rows turn into the two sets the nearby
// pipeline uses. Pure — the database read is in feedbackQuery.ts.
//
// Keyed by the provider's place id plus the provider, never the place's name:
// two branches of a chain are two places, and a name can be shared by
// unrelated businesses. Feedback is the user's own opinion, stored for them
// alone. It is never shown to anyone else or treated as verified fact about
// the place, and a card that was merely skipped produces none.

import type { PlaceFeedbackAction, PlaceFeedbackReason } from "../types";

/** The provider namespace for place ids (see NearbyPlace.id). Stored with every
 *  row so ids from a future provider can never collide with Google's. */
export const PLACE_PROVIDER = "google_places";

const ACTIONS: Record<PlaceFeedbackReason, PlaceFeedbackAction> = {
  closed: "exclude",
  dont_like: "exclude",
  bad_experience: "exclude",
  too_expensive: "downrank",
  other: "downrank",
};

export function isPlaceFeedbackReason(value: unknown): value is PlaceFeedbackReason {
  return typeof value === "string" && Object.hasOwn(ACTIONS, value);
}

/** Explicit, one-way: hard reasons hide the place; everything else only
 *  reduces its ranking. "Other" is deliberately the soft one — an unexplained
 *  tap shouldn't permanently remove a place. */
export function actionForReason(reason: PlaceFeedbackReason): PlaceFeedbackAction {
  return ACTIONS[reason];
}

export type PlaceFeedbackRow = { place_id: unknown; action: unknown };

export type PlaceFeedbackSets = {
  /** Never recommend these to this user. */
  excluded: Set<string>;
  /** Rank these lower; still eligible. */
  downranked: Set<string>;
};

/** Stored rows → the two id sets. Unreadable rows are skipped; an id can only
 *  be in one set, and exclusion wins if the data ever says both. */
export function toPlaceFeedbackSets(rows: readonly PlaceFeedbackRow[]): PlaceFeedbackSets {
  const excluded = new Set<string>();
  const downranked = new Set<string>();
  for (const row of rows) {
    if (typeof row.place_id !== "string" || !row.place_id) continue;
    if (row.action === "exclude") excluded.add(row.place_id);
    else if (row.action === "downrank") downranked.add(row.place_id);
  }
  for (const id of excluded) downranked.delete(id);
  return { excluded, downranked };
}
