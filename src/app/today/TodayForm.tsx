"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { DECISION_MODES, DEFAULT_MEAL_BUDGET, DEFAULT_TRAVEL_WILLINGNESS } from "@/lib/options";
import { contextsEqual } from "@/lib/recommend/contextEquality";
import { normalizeCraving } from "@/lib/text";
import type { ActiveSession, DecisionContext, DecisionMode, MealContext, OrderContext, StoreSnackContext } from "@/lib/types";
import CookForm from "./CookForm";
import type { FeedbackData } from "./MealFeedback";
import OrderForm from "./OrderForm";
import RecommendationResults, { isInventoryLimited, isNearbySession } from "./RecommendationResults";
import StoreSnackForm from "./StoreSnackForm";
import { useRecommend } from "./useRecommend";

function defaultCookContext(cookMinutes: number): MealContext {
  return {
    decision_mode: "cook",
    cook_minutes: cookMinutes,
    hunger: "normal",
    effort: "some",
    shopping: "can_buy",
    craving: null,
    ingredients_on_hand: [],
    budget_override_usd: null,
  };
}

function defaultOrderContext(): OrderContext {
  return {
    decision_mode: "order",
    hunger: "normal",
    craving_category: "no_preference",
    craving_note: null,
    method: "delivery",
    meal_budget: DEFAULT_MEAL_BUDGET,
    travel_willingness: DEFAULT_TRAVEL_WILLINGNESS,
  };
}

/** The form only ever holds the category-flow fields. `nearby` marks a
 *  request, not a form value, so a restored nearby session's flag is dropped
 *  here and re-added only when "Find food near me" is tapped. */
function toFormValues(context: OrderContext): OrderContext {
  const { nearby: _nearby, ...rest } = context;
  void _nearby;
  return rest;
}

function defaultStoreSnackContext(): StoreSnackContext {
  return {
    decision_mode: "store_snack",
    hunger: "normal",
    craving_type: "anything",
  };
}

export default function TodayForm({
  initial,
  usualCookMinutes,
  usualBudget,
  kitchenStaples,
  initialSession,
  initialChosenIndex,
  initialFeedback,
}: {
  initial: DecisionContext;
  usualCookMinutes: number;
  usualBudget: number;
  /** The user's persistent Kitchen staples (condiments/seasonings only), read
   *  server-side — Cook always has access to them without the user
   *  re-entering anything. Never actual food; see CookForm's "what do you
   *  have right now" for that. */
  kitchenStaples: string[];
  /** The most recent decision_sessions row, restored server-side — null on a
   *  first visit with no prior session. Restoring never calls the model. */
  initialSession: ActiveSession | null;
  initialChosenIndex: 0 | 1 | 2 | null;
  /** meal_feedback already recorded for that same session, if any. */
  initialFeedback: FeedbackData | null;
}) {
  // Each mode keeps its own form state, so switching modes never loses what
  // was typed into the other one. `mode` decides which half is shown and
  // which one "Find my meal" submits.
  const [mode, setMode] = useState<DecisionMode>(initial.decision_mode);
  const [cookValues, setCookValues] = useState<MealContext>(
    initial.decision_mode === "cook" ? initial : defaultCookContext(usualCookMinutes),
  );
  const [orderValues, setOrderValues] = useState<OrderContext>(
    initial.decision_mode === "order" ? toFormValues(initial) : defaultOrderContext(),
  );
  const [storeSnackValues, setStoreSnackValues] = useState<StoreSnackContext>(
    initial.decision_mode === "store_snack" ? initial : defaultStoreSnackContext(),
  );

  const { session, selection, request, run, retry, choose } = useRecommend({
    session: initialSession,
    chosenIndex: initialChosenIndex,
  });

  // Which action a loading request is for, so the right button (and only
  // that one) shows a loading label. Doesn't need to be reset on
  // success/error — it's only ever read while request.kind === "loading".
  const [pendingAction, setPendingAction] = useState<"generate" | "nearby" | "showMore" | "buy" | null>(null);

  // initialFeedback was only ever read for initialSession. The moment a
  // regenerate or "Show me 3 more" swaps in a new session, that restored
  // feedback no longer applies to whatever is now active — a brand-new
  // session has no feedback yet regardless of what the last one had.
  const feedbackForCurrentSession =
    session && initialSession && session.session_id === initialSession.session_id ? initialFeedback : null;

  // Whether the form (for the active mode) still matches the session on
  // screen. Decides which single action the primary button offers — see the
  // buttons below.
  const currentContext = mode === "cook" ? cookValues : mode === "order" ? orderValues : storeSnackValues;
  const isDirty = !session || !contextsEqual(currentContext, session.context);
  const busy = request.kind === "loading" || request.kind === "locating";
  const sessionIsNearby = !!session && isNearbySession(session);
  // Nearby results on screen while the Eat out form no longer matches them.
  // They are marked stale rather than silently standing in for the new
  // answers, and NOT refreshed automatically — each Places search is a paid
  // request, so only the explicit "Update places near me" tap makes one.
  const nearbyResultsStale = sessionIsNearby && mode === "order" && isDirty;

  /** Finalizes whatever is in the free-text craving box, then asks the
   *  recommender with the current form values for the active mode. Used for
   *  both the first "Find my meal" and "Update recommendations" — an update
   *  is just another call with whatever the form says right now. Runs only
   *  from the click handlers below — never from an effect — so one click is
   *  one request, and it always creates a new decision_sessions row. */
  function generate() {
    setPendingAction("generate");
    if (mode === "cook") {
      const finalized: MealContext = {
        ...cookValues,
        craving: cookValues.craving === null ? null : normalizeCraving(cookValues.craving),
      };
      setCookValues(finalized);
      void run(finalized);
    } else if (mode === "order") {
      const finalized: OrderContext = {
        ...orderValues,
        craving_note: orderValues.craving_note === null ? null : normalizeCraving(orderValues.craving_note),
      };
      setOrderValues(finalized);
      void run(finalized);
    } else {
      void run(storeSnackValues);
    }
  }

  /** "Find food near me" — the existing order context plus a `nearby` flag.
   *  The browser's location prompt appears only from here (via run), i.e.
   *  only after this tap. Nearby search is about going somewhere, so a
   *  "delivery" answer is switched to "eat nearby" and the form updated to
   *  match, the same way showWhatToBuy keeps the form and session in sync. */
  function findNearby() {
    setPendingAction("nearby");
    const method = orderValues.method === "delivery" ? "eat_nearby" : orderValues.method;
    const finalized: OrderContext = {
      ...orderValues,
      craving_note: orderValues.craving_note === null ? null : normalizeCraving(orderValues.craving_note),
      method,
      // Only Eat nearby asks how far; pickup/delivery keep the moderate default.
      travel_willingness: method === "eat_nearby" ? orderValues.travel_willingness : DEFAULT_TRAVEL_WILLINGNESS,
    };
    setOrderValues(finalized);
    void run({ ...finalized, nearby: true });
  }

  /** The category-based Eat out flow for the current order form — also the
   *  fallback when location or the places lookup fails. */
  function suggestFoodTypes() {
    setPendingAction("generate");
    const finalized: OrderContext = {
      ...orderValues,
      craving_note: orderValues.craving_note === null ? null : normalizeCraving(orderValues.craving_note),
    };
    setOrderValues(finalized);
    void run(finalized);
  }

  /** "Show me 3 more": same context as the current session — only offered
   *  while the form hasn't diverged from it, see isDirty — so it's a true
   *  re-roll, never a silent substitute for an edited context. Sends the
   *  current set along as exclusions, so the model avoids near-duplicates
   *  instead of minor variations. Also creates a new decision_sessions row. */
  function showMore() {
    if (!session) return;
    setPendingAction("showMore");
    void run(session.context, session.recommendations);
  }

  /** "Show me what to buy", offered after a thin or empty "Use what I have"
   *  result. Re-asks the same question with shopping allowed and the goal set
   *  to the fewest possible purchases — the existing "I can buy a few things"
   *  behavior, not a separate flow. Updates the form too, so the form and the
   *  session on screen still match once it lands. */
  function showWhatToBuy() {
    if (!session || session.context.decision_mode !== "cook") return;
    const next: MealContext = {
      ...session.context,
      shopping: "can_buy",
      budget_override_usd: null,
      minimize_purchases: true,
    };
    setPendingAction("buy");
    setMode("cook");
    setCookValues(next);
    void run(next);
  }

  const inventoryLimited = !!session && !isDirty && isInventoryLimited(session);

  return (
    <div className="space-y-4">
      <Card title="What's tonight?">
        <SingleChipGroup
          options={DECISION_MODES}
          value={mode}
          onChange={(value) => setMode(value as DecisionMode)}
        />
      </Card>

      {mode === "cook" ? (
        <CookForm
          values={cookValues}
          onChange={setCookValues}
          usualBudget={usualBudget}
          kitchenStaples={kitchenStaples}
        />
      ) : mode === "order" ? (
        <OrderForm values={orderValues} onChange={setOrderValues} />
      ) : (
        <StoreSnackForm values={storeSnackValues} onChange={setStoreSnackValues} />
      )}

      {/* The primary action lives in normal document flow, right where the
          submit button belongs — not sticky/floating, so it can never sit on
          top of a field or a card (that was the bug). It only appears while
          there's something for it to do: no session yet, or the form has
          diverged from the session on screen (isDirty). Once the form
          matches the session again, "Show me 3 more" below the cards is the
          only action — a single button never means two different things at
          once. */}
      {mode === "order" ? (
        <>
          {/* Two peers, each hidden only while its own result is on screen
              and unchanged — so after either kind of result the other is
              one tap away. */}
          {!(session && !sessionIsNearby && !isDirty) && (
            <button
              type="button"
              onClick={suggestFoodTypes}
              disabled={busy}
              className={
                sessionIsNearby
                  ? "w-full rounded-2xl border border-line bg-card py-3 text-sm font-semibold disabled:opacity-60"
                  : "w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-60"
              }
            >
              {request.kind === "loading" && pendingAction === "generate"
                ? "Finding your meal…"
                : sessionIsNearby
                  ? "Get food ideas by type"
                  : session
                    ? "Update recommendations"
                    : "Find my meal"}
            </button>
          )}
          {!(sessionIsNearby && !isDirty) && (
            <div>
              <button
                type="button"
                onClick={findNearby}
                disabled={busy}
                className="w-full rounded-2xl border border-accent bg-card py-3 text-sm font-semibold text-accent disabled:opacity-60"
              >
                {busy && pendingAction === "nearby"
                  ? "Finding places near you…"
                  : sessionIsNearby
                    ? "Update places near me"
                    : "📍 Find food near me"}
              </button>
              <p className="mt-1.5 text-center text-xs text-muted">
                Real places nearby. Your location is used once for this search and isn&apos;t saved.
              </p>
            </div>
          )}
        </>
      ) : (
        (!session || isDirty) && (
          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-60"
          >
            {request.kind === "loading" && pendingAction === "generate"
              ? "Finding your meal…"
              : session
                ? "Update recommendations"
                : "Find my meal"}
          </button>
        )
      )}

      <RecommendationResults
        session={session}
        selection={selection}
        request={request}
        initialFeedback={feedbackForCurrentSession}
        onRetry={retry}
        onChoose={choose}
        onFallback={mode === "order" ? suggestFoodTypes : undefined}
        stale={nearbyResultsStale}
        searchingNearby={pendingAction === "nearby" || (pendingAction === "showMore" && sessionIsNearby)}
      />

      {/* A thin or empty "Use what I have" result: "3 more" would only push
          the model toward inventing ingredients, so the way forward is
          buying instead. */}
      {inventoryLimited && (
        <button
          type="button"
          onClick={showWhatToBuy}
          disabled={busy}
          className="w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-60"
        >
          {request.kind === "loading" && pendingAction === "buy" ? "Finding what to buy…" : "Show me what to buy"}
        </button>
      )}

      {/* Same context, different options — only offered once the form
          matches the session, so it never silently discards an edit the
          user hasn't submitted yet. */}
      {session && !isDirty && !inventoryLimited && !(sessionIsNearby && session.recommendations.length === 0) && (
        <button
          type="button"
          onClick={showMore}
          disabled={busy}
          className="w-full rounded-2xl border border-accent bg-card py-3 text-sm font-semibold text-accent disabled:opacity-60"
        >
          {busy && pendingAction === "showMore" ? "Finding 3 more…" : "Show me 3 more"}
        </button>
      )}
    </div>
  );
}
