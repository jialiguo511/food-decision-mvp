// What kind of result set is on screen. Pure, shared by the results screen
// and its tests.

import type { ActiveSession, Recommendation } from "@/lib/types";

/** A session produced by a nearby search (the context flag is what
 *  distinguishes it from food ideas by type, which share decision_mode). */
export function isNearbySession(session: ActiveSession): boolean {
  return session.context.decision_mode === "order" && session.context.nearby === true;
}

export function inventoryNote(recommendation: Recommendation): string | null {
  return recommendation.decision_mode === "cook" ? recommendation.inventory_note : null;
}

/** A strict "Use what I have" result that fell short — fewer than three
 *  options (down to zero), or the model flagged that what's available can't
 *  make a full meal. Offers "Show me what to buy" instead of "3 more" (which
 *  would only push toward inventing ingredients). */
export function isInventoryLimited(session: ActiveSession): boolean {
  if (session.context.decision_mode !== "cook" || session.context.shopping !== "inventory_only") return false;
  return session.recommendations.length < 3 || session.recommendations.some((r) => inventoryNote(r) !== null);
}
