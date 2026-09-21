"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { DECISION_MODES } from "@/lib/options";
import { normalizeCraving } from "@/lib/text";
import type { ActiveSession, DecisionContext, DecisionMode, MealContext, OrderContext, StoreSnackContext } from "@/lib/types";
import CookForm from "./CookForm";
import type { FeedbackData } from "./MealFeedback";
import OrderForm from "./OrderForm";
import RecommendationResults from "./RecommendationResults";
import StoreSnackForm from "./StoreSnackForm";
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

function defaultStoreSnackContext(): StoreSnackContext {
  return {
    decision_mode: "store_snack",
    hunger: "normal",
    craving_type: "anything",
  };
}

/** Whether two contexts represent the same request. Used only to decide
 *  which action button to show (see below) — not a strict/canonical
 *  equality, just good enough for that UI decision. */
function contextsEqual(a: DecisionContext, b: DecisionContext): boolean {
  if (a.decision_mode !== b.decision_mode) return false;
  if (a.decision_mode === "cook" && b.decision_mode === "cook") {
    return (
      a.cook_minutes === b.cook_minutes &&
      a.hunger === b.hunger &&
      a.effort === b.effort &&
      a.craving === b.craving &&
      a.budget_override_usd === b.budget_override_usd &&
      arraysEqual(a.ingredients_on_hand, b.ingredients_on_hand)
    );
  }
  if (a.decision_mode === "order" && b.decision_mode === "order") {
    return (
      a.hunger === b.hunger &&
      a.craving_category === b.craving_category &&
      a.craving_note === b.craving_note &&
      a.method === b.method
    );
  }
  if (a.decision_mode === "store_snack" && b.decision_mode === "store_snack") {
    return a.hunger === b.hunger && a.craving_type === b.craving_type;
  }
  return false;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
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
  const [pendingAction, setPendingAction] = useState<"generate" | "showMore" | null>(null);

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
      {(!session || isDirty) && (
        <button
          type="button"
          onClick={generate}
          disabled={request.kind === "loading"}
          className="w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 disabled:opacity-60"
        >
          {request.kind === "loading" && pendingAction === "generate"
            ? "Finding your meal…"
            : session
              ? "Update recommendations"
              : "Find my meal"}
        </button>
      )}

      <RecommendationResults
        session={session}
        selection={selection}
        request={request}
        initialFeedback={feedbackForCurrentSession}
        onRetry={retry}
        onChoose={choose}
      />

      {/* Same context, different options — only offered once the form
          matches the session, so it never silently discards an edit the
          user hasn't submitted yet. */}
      {session && !isDirty && (
        <button
          type="button"
          onClick={showMore}
          disabled={request.kind === "loading"}
          className="w-full rounded-2xl border border-accent bg-card py-3 text-sm font-semibold text-accent disabled:opacity-60"
        >
          {request.kind === "loading" && pendingAction === "showMore" ? "Finding 3 more…" : "Show me 3 more"}
        </button>
      )}
    </div>
  );
}
