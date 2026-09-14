"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { DECISION_MODES } from "@/lib/options";
import { normalizeCraving } from "@/lib/text";
import type { ActiveSession, DecisionContext, DecisionMode, MealContext, OrderContext } from "@/lib/types";
import CookForm from "./CookForm";
import type { FeedbackData } from "./MealFeedback";
import OrderForm from "./OrderForm";
import RecommendationResults from "./RecommendationResults";
import { useRecommend } from "./useRecommend";

function defaultCookContext(cookMinutes: number): MealContext {
  return {
    decision_mode: "cook",
    cook_minutes: cookMinutes,
    hunger: "normal",
    effort: "some",
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
  };
}

export default function TodayForm({
  initial,
  usualCookMinutes,
  usualBudget,
  initialSession,
  initialChosenIndex,
  initialFeedback,
}: {
  initial: DecisionContext;
  usualCookMinutes: number;
  usualBudget: number;
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
    initial.decision_mode === "order" ? initial : defaultOrderContext(),
  );

  const { session, selection, request, run, retry, choose } = useRecommend({
    session: initialSession,
    chosenIndex: initialChosenIndex,
  });

  // initialFeedback was only ever read for initialSession. The moment a
  // regenerate or "Show me 3 more" swaps in a new session, that restored
  // feedback no longer applies to whatever is now active — a brand-new
  // session has no feedback yet regardless of what the last one had.
  const feedbackForCurrentSession =
    session && initialSession && session.session_id === initialSession.session_id ? initialFeedback : null;

  /** Finalizes whatever is in the free-text craving box, then asks the
   *  recommender with the current form values for the active mode. Used for
   *  both the first "Find my meal" and "Regenerate recommendations" — a
   *  regenerate is just another call with whatever the form says right now,
   *  edited or not. Runs only from the click handlers below — never from an
   *  effect — so one click is one request, and it always creates a new
   *  decision_sessions row. */
  function generate() {
    if (mode === "cook") {
      const finalized: MealContext = {
        ...cookValues,
        craving: cookValues.craving === null ? null : normalizeCraving(cookValues.craving),
      };
      setCookValues(finalized);
      void run(finalized);
    } else {
      const finalized: OrderContext = {
        ...orderValues,
        craving_note: orderValues.craving_note === null ? null : normalizeCraving(orderValues.craving_note),
      };
      setOrderValues(finalized);
      void run(finalized);
    }
  }

  /** "Show me 3 more": same context as the current session, ignoring any
   *  unsaved edits sitting in the form (including a mode switch), so it's a
   *  true re-roll rather than a regenerate in disguise. Sends the current set
   *  along as exclusions, so the model avoids near-duplicates instead of
   *  minor variations. Also creates a new decision_sessions row. */
  function showMore() {
    if (!session) return;
    if (session.context.decision_mode === "cook") {
      setMode("cook");
      setCookValues(session.context);
    } else {
      setMode("order");
      setOrderValues(session.context);
    }
    void run(session.context, session.recommendations);
  }

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
        <CookForm values={cookValues} onChange={setCookValues} usualBudget={usualBudget} />
      ) : (
        <OrderForm values={orderValues} onChange={setOrderValues} />
      )}

      <RecommendationResults
        session={session}
        selection={selection}
        request={request}
        initialFeedback={feedbackForCurrentSession}
        onRetry={retry}
        onChoose={choose}
      />

      {/* Sticky so the action is always reachable on a phone. Once a session
          exists, selecting a card does not remove or disable these — picking
          one should not lock the user out of trying again. */}
      <div className="sticky bottom-24 space-y-2 pt-2">
        <button
          type="button"
          onClick={generate}
          disabled={request.kind === "loading"}
          className="w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-60"
        >
          {request.kind === "loading"
            ? "Finding your meal…"
            : session
              ? "Regenerate recommendations"
              : "Find my meal"}
        </button>
        {session && (
          <button
            type="button"
            onClick={showMore}
            disabled={request.kind === "loading"}
            className="w-full rounded-2xl border border-accent bg-card py-3 text-sm font-semibold text-accent disabled:opacity-60"
          >
            Show me 3 more
          </button>
        )}
      </div>
    </div>
  );
}
