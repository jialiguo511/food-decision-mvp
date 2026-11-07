// Turns a raw decision_sessions row into what Today needs to resume the flow
// without calling the model again — or null if the row is missing, not this
// user's, or unreadable. Reuses the same context and recommendation
// validators the live /api/recommend request already trusts, rather than a
// parallel check, so a corrupted or hand-edited row is discarded, not
// rendered.

import { contextSchema } from "./input";
import { storedRecommendationsSchema, stripLeakedImageQueryStep } from "./output";
import type { ActiveSession } from "../types";

import { SESSION_RESTORE_WINDOW_MS } from "./sessionWindow";

export { SESSION_RESTORE_WINDOW_MS };

/** Whether a row's `created_at` is recent enough to auto-restore. A missing,
 *  unparseable or future-dated timestamp is treated as not recent — never
 *  restore on doubt. */
export function isRecentSession(createdAt: unknown, now: number = Date.now()): boolean {
  if (typeof createdAt !== "string") return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  return age >= 0 && age <= SESSION_RESTORE_WINDOW_MS;
}

export type RestoredSession = {
  session: ActiveSession;
  chosenIndex: 0 | 1 | 2 | null;
};

export function parseStoredSession(row: unknown): RestoredSession | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;

  const context = parseStoredContext(row.context);
  const recommendations = storedRecommendationsSchema.safeParse(taggedRecommendations(row.recommendations));
  if (!context.success || !recommendations.success) return null;

  // Same defense as parseRecommendations (see output.ts) applied to a
  // restored row: a session saved before that fix shipped could still have
  // the leaked "image_query" artifact sitting in a Cook recommendation's
  // steps. If sanitizing empties a recommendation's steps entirely, treat
  // the row as corrupted, same as any other validation failure here.
  const sanitized = recommendations.data.map((r) =>
    r.decision_mode === "cook" ? { ...r, steps: stripLeakedImageQueryStep(r.steps) } : r,
  );
  if (sanitized.some((r) => r.decision_mode === "cook" && r.steps.length === 0)) return null;

  const chosenIndex =
    row.chosen_index === 0 || row.chosen_index === 1 || row.chosen_index === 2
      ? row.chosen_index
      : null;

  return {
    session: {
      session_id: row.id,
      context: context.data,
      recommendations: sanitized as ActiveSession["recommendations"],
    },
    chosenIndex,
  };
}

/** Rows written before the "I want to order food" mode existed have no
 *  `decision_mode` on their context — they all predate the field, and are
 *  all cook sessions. Tag them so they still restore instead of being
 *  silently dropped. Separately, rows written before the inventory-only
 *  shopping toggle existed have no `shopping` field on a cook context;
 *  default those to "can_buy", the prior (and only) behavior, so restoring
 *  an old session doesn't change what it meant. (Order rows with no
 *  `meal_budget` need no shim: orderContextSchema defaults it to
 *  "no_preference".) New rows always write all of
 *  these fields themselves, so this is a no-op for anything written by the current
 *  code. */
function withDefaultMode(context: unknown): unknown {
  if (!isRecord(context)) return context;
  const withMode = "decision_mode" in context ? context : { ...context, decision_mode: "cook" };
  if (withMode.decision_mode !== "cook" || "shopping" in withMode) return withMode;
  return { ...withMode, shopping: "can_buy" };
}

/** Same backward-compat shim, applied per recommendation — old rows have
 *  `steps`/`ingredients`/etc. but no `decision_mode` tag on each item. */
function taggedRecommendations(recommendations: unknown): unknown {
  if (!Array.isArray(recommendations)) return recommendations;
  return recommendations.map((r) =>
    isRecord(r) && !("decision_mode" in r) ? { ...r, decision_mode: "cook" } : r,
  );
}

/** A stored `decision_sessions.context`, validated by the same schema (and
 *  legacy shims) as a live request — the success/failure result of zod, so a
 *  corrupted or hand-edited row is never trusted. */
export function parseStoredContext(context: unknown) {
  return contextSchema.safeParse(withDefaultMode(context));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
