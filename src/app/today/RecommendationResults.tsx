"use client";

import Card from "@/components/ui/Card";
import type { ActiveSession, Recommendation, RecommendFailure } from "@/lib/types";
import MealFeedback, { type FeedbackData } from "./MealFeedback";
import type { Selection } from "./useRecommend";

/**
 * Presentational only — TodayForm owns the request/session/selection state
 * via useRecommend and passes it down.
 *
 * `session` and the request status are independent: a failed regenerate or
 * "Show me 3 more" leaves the last successful `session` (and its selection)
 * in place, so this keeps showing those three cards under the error banner
 * instead of wiping them out.
 *
 * Once a card is chosen, MealFeedback renders below the cards asking "Did
 * you eat this?" — keyed by session_id so it starts fresh for a new session
 * (selection always resets to "none" the moment a new session replaces this
 * one, so the two never show at the same time for the same render anyway).
 */

const ROLE_LABELS: Record<Recommendation["role"], string> = {
  best_match: "Best match",
  lowest_effort: "Lowest effort",
  alternative: "Alternative",
};

export default function RecommendationResults({
  session,
  selection,
  request,
  initialFeedback,
  onRetry,
  onChoose,
}: {
  session: ActiveSession | null;
  selection: Selection;
  request: { kind: "idle" } | { kind: "loading" } | { kind: "error"; error: RecommendFailure["error"] };
  /** Restored from meal_feedback for the session that was active on page
   *  load, if that session still had a chosen recommendation. Null for a
   *  freshly generated or freshly chosen session — there's nothing to
   *  restore yet. */
  initialFeedback: FeedbackData | null;
  onRetry: () => void;
  onChoose: (index: 0 | 1 | 2) => void;
}) {
  if (request.kind === "loading") {
    return (
      <section
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-dashed border-accent/40 bg-accent-soft/50 p-5 text-center"
      >
        <p className="text-sm font-medium text-accent">Finding your meal…</p>
        <p className="mt-1 text-xs text-muted">
          This usually takes under a minute.
        </p>
      </section>
    );
  }

  if (request.kind === "idle" && !session) return null;

  const somethingChosen = selection.status === "chosen";

  return (
    <div className="space-y-3">
      {request.kind === "error" && (
        <section role="alert" className="rounded-2xl border border-line bg-card p-5">
          <p className="text-sm font-semibold text-red-600">
            Couldn&apos;t get new recommendations
          </p>
          <p className="mt-1 text-sm text-muted">{request.error.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 w-full rounded-xl border border-accent bg-card py-2.5 text-sm font-semibold text-accent"
          >
            Try again
          </button>
        </section>
      )}

      {session && (
        <>
          <p className="text-xs text-muted">All numbers below are estimates.</p>
          {session.recommendations.map((r, i) => {
            const index = i as 0 | 1 | 2;
            const isThisChosen = somethingChosen && selection.index === index;
            const isThisChoosing = selection.status === "choosing" && selection.index === index;
            const isThisFailed = selection.status === "failed" && selection.index === index;

            return (
              <Card key={r.role} title={ROLE_LABELS[r.role]} highlighted={isThisChosen}>
                <h3 className="text-base font-semibold">{r.title}</h3>
                <p className="mt-1 text-xs text-muted">
                  ~{r.estimated_minutes} min · ~{r.estimated_calories} cal · ~
                  {r.estimated_protein_g}g protein · ~${r.estimated_meal_cost_usd} meal
                  · ~${r.estimated_extra_cost_usd} more to buy
                </p>
                <p className="mt-2 text-sm">{r.reason}</p>

                <p className="mt-3 text-xs">
                  <span className="text-muted">Have:</span>{" "}
                  {r.ingredients_on_hand.join(", ") || "—"}
                </p>
                <p className="text-xs">
                  <span className="text-muted">Need:</span>{" "}
                  {r.ingredients_needed.join(", ") || "—"}
                </p>
                {r.equipment.length > 0 && (
                  <p className="text-xs">
                    <span className="text-muted">Equipment:</span>{" "}
                    {r.equipment.join(", ")}
                  </p>
                )}

                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                  {r.steps.map((step, stepIndex) => (
                    <li key={stepIndex}>{step}</li>
                  ))}
                </ol>

                {isThisFailed && (
                  <p className="mt-3 text-xs text-red-600">
                    {selection.message || "Couldn't save your choice. Please try again."}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => onChoose(index)}
                  disabled={somethingChosen || selection.status === "choosing"}
                  className={`mt-4 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 ${
                    isThisChosen
                      ? "bg-accent text-white"
                      : "border border-accent bg-card text-accent"
                  }`}
                >
                  {isThisChosen
                    ? "✓ Selected"
                    : isThisChoosing
                      ? "Saving…"
                      : isThisFailed
                        ? "Try again"
                        : "Choose this"}
                </button>
              </Card>
            );
          })}

          {somethingChosen && (
            <MealFeedback
              key={session.session_id}
              sessionId={session.session_id}
              mealTitle={session.recommendations[selection.index].title}
              initial={initialFeedback ?? { id: null, didEat: null, note: null }}
            />
          )}
        </>
      )}
    </div>
  );
}
