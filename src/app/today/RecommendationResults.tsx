"use client";

import Card from "@/components/ui/Card";
import type { ActiveSession, Recommendation, RecommendUiError } from "@/lib/types";
import MealFeedback, { type FeedbackData } from "./MealFeedback";
import NearbyPlaceDetails from "./NearbyPlaceDetails";
import RecipeImage from "./RecipeImage";
import type { RequestStatus, Selection } from "./useRecommend";

/**
 * Presentational only — TodayForm owns the request/session/selection state
 * via useRecommend and passes it down.
 *
 * `session` and the request status are independent: a failed regenerate or
 * "Show me 3 more" leaves the last successful `session` (and its selection)
 * in place, so this keeps showing those three cards under the error banner
 * instead of wiping them out.
 *
 * Once a card is chosen, MealFeedback renders below the cards asking what
 * happened next — the exact question depends on decision_mode, see
 * MealFeedback.tsx — keyed by session_id so it starts fresh for a new session
 * (selection always resets to "none" the moment a new session replaces this
 * one, so the two never show at the same time for the same render anyway).
 */

// Role labels are mode-specific: "best_match" / "lowest_effort" /
// "alternative" are the recommender's internal categories (see CLAUDE.md and
// prompt.ts), but the words that fit a recipe don't fit a food-ordering
// decision. "Lowest effort" reads as "cook the laziest thing"; for ordering
// the same role actually means "the easiest thing to find and order right
// now" — a different idea, so it gets a different label.
const COOK_ROLE_LABELS: Record<Recommendation["role"], string> = {
  best_match: "Best match",
  lowest_effort: "Lowest effort",
  alternative: "Alternative",
};

const ORDER_ROLE_LABELS: Record<Recommendation["role"], string> = {
  best_match: "Top pick",
  lowest_effort: "Easy to order",
  alternative: "Something different",
};

// Same reasoning as the other two label sets: "lowest effort" doesn't mean
// anything for a store snack (everything here is a quick grab), so that role
// is relabeled around how much it leans into the craving instead. Never
// "healthiest" / "cleanest" / "guilt-free" — see CLAUDE.md and prompt.ts.
const STORE_SNACK_ROLE_LABELS: Record<Recommendation["role"], string> = {
  best_match: "Best fit",
  lowest_effort: "Most satisfying",
  alternative: "Lighter option",
};

// Nearby places: "Lowest effort" doesn't fit a place, so that role becomes
// "Close & easy" — the simple, near, likely-open pick.
const NEARBY_ROLE_LABELS: Record<Recommendation["role"], string> = {
  best_match: "Best fit",
  lowest_effort: "Close & easy",
  alternative: "Something different",
};

/** Errors that come from the nearby flow itself (location or the places
 *  lookup), as opposed to the recommender. They get their own copy and a way
 *  back to the category-based flow, which needs neither. */
const NEARBY_ERROR_COPY: Partial<Record<RecommendUiError["code"], string>> = {
  places_not_configured: "Nearby search isn't set up on this app yet. You can still get food ideas by type.",
  places_unavailable: "We couldn't look up places near you right now. Try again in a moment, or get food ideas by type.",
  invalid_location: "We didn't receive your location. Try again, or get food ideas by type instead.",
};
const NEARBY_ERROR_CODES = new Set<RecommendUiError["code"]>([
  "location_unsupported",
  "location_denied",
  "location_unavailable",
  "location_timeout",
  ...(Object.keys(NEARBY_ERROR_COPY) as RecommendUiError["code"][]),
]);
/** Retrying can't fix these; only the fallback is useful. */
const NOT_RETRYABLE = new Set<RecommendUiError["code"]>(["places_not_configured", "location_unsupported"]);

/** A strict "Use what I have" result that fell short — fewer than three
 *  options (down to zero, when nothing on hand adds up to a meal), or the
 *  model flagged that what's available can't make a full meal. TodayForm
 *  uses the same test to offer "Show me what to buy". Always false for a
 *  request that allowed shopping, and for the other two modes. */
export function isInventoryLimited(session: ActiveSession): boolean {
  if (session.context.decision_mode !== "cook" || session.context.shopping !== "inventory_only") return false;
  return session.recommendations.length < 3 || session.recommendations.some((r) => inventoryNote(r) !== null);
}

/** A session produced by "Find food near me" (the context flag is what
 *  distinguishes it from the category flow, which shares decision_mode). */
export function isNearbySession(session: ActiveSession): boolean {
  return session.context.decision_mode === "order" && session.context.nearby === true;
}

function inventoryNote(recommendation: Recommendation): string | null {
  return recommendation.decision_mode === "cook" ? recommendation.inventory_note : null;
}

function roleLabel(recommendation: Recommendation): string {
  if (recommendation.decision_mode === "order") return ORDER_ROLE_LABELS[recommendation.role];
  if (recommendation.decision_mode === "store_snack") return STORE_SNACK_ROLE_LABELS[recommendation.role];
  if (recommendation.decision_mode === "nearby") return NEARBY_ROLE_LABELS[recommendation.role];
  return COOK_ROLE_LABELS[recommendation.role];
}

export default function RecommendationResults({
  session,
  selection,
  request,
  initialFeedback,
  onRetry,
  onChoose,
  onFallback,
  searchingNearby = false,
}: {
  session: ActiveSession | null;
  selection: Selection;
  request: RequestStatus;
  /** Restored from meal_feedback for the session that was active on page
   *  load, if that session still had a chosen recommendation. Null for a
   *  freshly generated or freshly chosen session — there's nothing to
   *  restore yet. */
  initialFeedback: FeedbackData | null;
  onRetry: () => void;
  onChoose: (index: 0 | 1 | 2) => void;
  /** Switches from a failed nearby search to the category-based Eat out
   *  flow. Offered only alongside nearby errors and empty nearby results. */
  onFallback?: () => void;
  /** The in-flight request is a nearby search (changes only the loading copy). */
  searchingNearby?: boolean;
}) {
  if (request.kind === "locating") {
    return (
      <section
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-dashed border-accent/40 bg-accent-soft/50 p-5 text-center"
      >
        <p className="text-sm font-medium text-accent">Finding where you are…</p>
        <p className="mt-1 text-xs text-muted">
          Your browser may ask to share your location. It&apos;s used only for this search and isn&apos;t saved.
        </p>
      </section>
    );
  }

  if (request.kind === "loading") {
    return (
      <section
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-dashed border-accent/40 bg-accent-soft/50 p-5 text-center"
      >
        <p className="text-sm font-medium text-accent">
          {searchingNearby ? "Finding places near you…" : "Finding your meal…"}
        </p>
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
            {NEARBY_ERROR_CODES.has(request.error.code)
              ? "Couldn't search near you"
              : "Couldn't get new recommendations"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {NEARBY_ERROR_COPY[request.error.code] ?? request.error.message}
          </p>
          {!NOT_RETRYABLE.has(request.error.code) && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 w-full rounded-xl border border-accent bg-card py-2.5 text-sm font-semibold text-accent"
            >
              Try again
            </button>
          )}
          {onFallback && NEARBY_ERROR_CODES.has(request.error.code) && (
            <button
              type="button"
              onClick={onFallback}
              className="mt-2 w-full rounded-xl border border-line bg-card py-2.5 text-sm font-semibold"
            >
              Get food ideas by type instead
            </button>
          )}
        </section>
      )}

      {session && (
        <>
          {session.recommendations.length > 0 && !isNearbySession(session) && (
            <p className="text-xs text-muted">
              {session.context.decision_mode === "order"
                ? "All numbers are estimates — exact dishes aren't guaranteed to be available nearby."
                : session.context.decision_mode === "store_snack"
                  ? "All numbers are estimates — exact products aren't guaranteed to be in stock nearby."
                  : "All numbers below are estimates."}
            </p>
          )}
          {isNearbySession(session) && session.recommendations.length > 0 && (
            <p className="text-xs text-muted">
              Real places near you, from Google Maps. Menus aren&apos;t checked — &quot;Look for&quot; is a suggestion,
              not a promise that they serve it. Distances are approximate, in a straight line.
            </p>
          )}
          {isNearbySession(session) && session.recommendations.length === 0 && (
            <section className="rounded-2xl border border-accent/40 bg-accent-soft/50 p-4">
              <p className="text-sm font-medium text-accent">No open places to show near you right now.</p>
              <p className="mt-1 text-xs text-muted">
                We didn&apos;t find any (more) within about a mile. You can still get food ideas by type.
              </p>
              {onFallback && (
                <button
                  type="button"
                  onClick={onFallback}
                  className="mt-3 w-full rounded-xl border border-accent bg-card py-2.5 text-sm font-semibold text-accent"
                >
                  Get food ideas by type
                </button>
              )}
            </section>
          )}
          {isNearbySession(session) && session.recommendations.length > 0 && session.recommendations.length < 3 && (
            <section className="rounded-2xl border border-accent/40 bg-accent-soft/50 p-4">
              <p className="text-sm font-medium text-accent">
                Only {session.recommendations.length === 1 ? "one good option" : `${session.recommendations.length} good options`}{" "}
                near you right now.
              </p>
              <p className="mt-1 text-xs text-muted">That&apos;s all we found open within about a mile — we don&apos;t pad the list.</p>
            </section>
          )}
          {isInventoryLimited(session) && (
            <section className="rounded-2xl border border-accent/40 bg-accent-soft/50 p-4">
              <p className="text-sm font-medium text-accent">
                {session.recommendations.length === 0
                  ? "Not enough here for a full meal."
                  : (session.recommendations.map(inventoryNote).find((note) => note !== null) ??
                    "There may not be enough for a full meal.")}
              </p>
              {session.recommendations.length > 0 && session.recommendations.length < 3 && (
                <p className="mt-1 text-xs text-muted">
                  Showing only what you can make with what you have — nothing that needs something you don&apos;t.
                </p>
              )}
            </section>
          )}
          {session.recommendations.map((r, i) => {
            const index = i as 0 | 1 | 2;
            const isThisChosen = somethingChosen && selection.index === index;
            const isThisChoosing = selection.status === "choosing" && selection.index === index;
            const isThisFailed = selection.status === "failed" && selection.index === index;

            return (
              <Card key={r.role} title={roleLabel(r)} highlighted={isThisChosen}>
                {r.decision_mode === "cook" && (
                  <RecipeImage query={r.image_query} size={r.role === "best_match" ? "large" : "thumbnail"} />
                )}
                <h3 className="text-base font-semibold">{r.title}</h3>

                {r.decision_mode === "cook" ? (
                  <>
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
                        <span className="text-muted">Equipment:</span> {r.equipment.join(", ")}
                      </p>
                    )}

                    <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                      {r.steps.map((step, stepIndex) => (
                        <li key={stepIndex}>{step}</li>
                      ))}
                    </ol>
                  </>
                ) : r.decision_mode === "nearby" ? (
                  <NearbyPlaceDetails r={r} />
                ) : r.decision_mode === "order" ? (
                  <>
                    <p className="mt-1 text-xs text-muted">
                      ~{r.estimated_calories} cal · ~{r.estimated_protein_g}g protein
                    </p>
                    <p className="mt-2 text-sm">{r.reason}</p>

                    {/* Three distinct things, deliberately not merged into one
                        line: broad terms to type into a search bar (not a
                        guarantee any of them return a result — there's no
                        menu data behind this app), what to look for once
                        results come up, and an optional tweak to the order
                        itself. */}
                    <p className="mt-3 text-xs">
                      <span className="text-muted">Try searching:</span>{" "}
                      {r.search_terms.join(" · ")}
                    </p>
                    <p className="text-xs">
                      <span className="text-muted">Look for:</span> {r.order_notes}
                    </p>
                    {r.modification && (
                      <p className="mt-2 text-xs">
                        <span className="text-muted">Customize:</span> {r.modification}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-muted">
                      ~{r.estimated_calories} cal · ~{r.estimated_protein_g}g protein
                    </p>
                    <p className="mt-2 text-sm">{r.reason}</p>

                    <p className="mt-3 text-xs">
                      <span className="text-muted">Look for:</span> {r.what_to_look_for}
                    </p>
                    {r.backup && (
                      <p className="text-xs">
                        <span className="text-muted">If you can&apos;t find that:</span> {r.backup}
                      </p>
                    )}
                  </>
                )}

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
              decisionMode={session.context.decision_mode}
              nearby={isNearbySession(session)}
              initial={initialFeedback ?? { id: null, didEat: null, note: null }}
            />
          )}
        </>
      )}
    </div>
  );
}
