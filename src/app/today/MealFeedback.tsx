"use client";

import { useRef, useState } from "react";
import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import {
  COOK_REJECTION_REASONS,
  NEARBY_OUTCOMES,
  NEARBY_REJECTION_REASONS,
  ORDER_OUTCOMES,
  ORDER_REJECTION_REASONS,
  STORE_SNACK_REJECTION_REASONS,
  WOULD_EAT_AGAIN,
} from "@/lib/options";
import type { DecisionMode } from "@/lib/types";
import { recordMealFeedback, setMealFeedbackNote } from "./actions";
import { friendlyActionError } from "./results/errorCopy";

export type FeedbackData = {
  /** meal_feedback.id, once a row exists. Null means nothing recorded yet. */
  id: string | null;
  didEat: boolean | null;
  note: string | null;
};

/**
 * The core loop's final step. Shown once a card is selected — see
 * results/ResultsScreen.tsx. Writes to the existing meal_feedback table only; no
 * new schema, no rating, no comments.
 *
 * The three modes ask different questions here, not just different labels on
 * the same question:
 *  - Cook mode: "Did you eat this?" — choosing a recipe and eating it are
 *    close together in time, so a plain yes/no still fits.
 *  - Store-snack mode: same "Did you eat this?" shape as cook mode — choosing
 *    a card means going to buy it, which is just as close in time — but with
 *    its own rejection reasons (STORE_SNACK_REJECTION_REASONS) instead of
 *    cooking-specific ones like "missing ingredients".
 *  - Nearby places (order mode with `nearby`): same shape as order mode —
 *    choosing a card only means "planning to go there" — with "went there"
 *    wording and trip-shaped reasons ("too far", "it was closed").
 *  - Order mode: choosing a card only means "planning to order this", not
 *    that anything has arrived yet — see PRODUCT.md / the order flow. The
 *    first question is "What happened?", and its own outcomes ("I ordered
 *    it" / "I ordered something similar" / "Didn't end up ordering it") fold
 *    in what cook mode asks as a separate yes/no.
 *
 * `didEat` and `note` are both write-once: once answered, that question
 * stops rendering and shows the recorded answer instead, and the handlers
 * below also guard against a stale duplicate call landing after the fact.
 */
export default function MealFeedback({
  sessionId,
  mealTitle,
  decisionMode,
  nearby = false,
  initial,
}: {
  sessionId: string;
  mealTitle: string;
  decisionMode: DecisionMode;
  /** The session came from a nearby search — see results/sessionKind.ts. */
  nearby?: boolean;
  initial: FeedbackData;
}) {
  const [feedback, setFeedback] = useState<FeedbackData>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const answering = useRef(false);
  const noting = useRef(false);

  async function answer(didEat: boolean) {
    if (answering.current || feedback.id !== null) return;
    answering.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await recordMealFeedback(sessionId, mealTitle, didEat);
      if (result.ok) setFeedback({ id: result.id, didEat: result.didEat, note: result.note });
      else setError(friendlyActionError(result.error, "Couldn't save your answer. Please try again."));
    } catch (err) {
      setError(friendlyActionError(err instanceof Error ? err.message : "", "Couldn't save your answer. Please try again."));
    } finally {
      setSaving(false);
      answering.current = false;
    }
  }

  async function answerNote(note: string) {
    if (!feedback.id || noting.current || feedback.note !== null) return;
    noting.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await setMealFeedbackNote(feedback.id, note);
      if (result.ok) setFeedback((current) => ({ ...current, note }));
      else setError(friendlyActionError(result.error, "Couldn't save your answer. Please try again."));
    } catch (err) {
      setError(friendlyActionError(err instanceof Error ? err.message : "", "Couldn't save your answer. Please try again."));
    } finally {
      setSaving(false);
      noting.current = false;
    }
  }

  /** Order mode's first question. "Didn't end up ordering it" is just a
   *  plain no — reuses `answer`, and the reason gets asked next, the same
   *  shape as cook mode. The two positive outcomes record both the yes and
   *  the specific outcome in one tap, since asking "did you order it?" and
   *  then "which — exactly this, or something similar?" as two questions
   *  would be needless friction for an MVP. */
  async function answerOrderOutcome(value: string) {
    if (value === "didnt_order") {
      await answer(false);
      return;
    }
    if (answering.current || feedback.id !== null) return;
    answering.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await recordMealFeedback(sessionId, mealTitle, true);
      if (!result.ok) {
        setError(friendlyActionError(result.error, "Couldn't save your answer. Please try again."));
        return;
      }
      const noteResult = await setMealFeedbackNote(result.id, value);
      setFeedback({ id: result.id, didEat: true, note: noteResult.ok ? value : result.note });
      if (!noteResult.ok) setError(friendlyActionError(noteResult.error, "Couldn't save your answer. Please try again."));
    } catch (err) {
      setError(friendlyActionError(err instanceof Error ? err.message : "", "Couldn't save your answer. Please try again."));
    } finally {
      setSaving(false);
      answering.current = false;
    }
  }

  if (decisionMode === "order") return renderOrder(nearby);
  return renderCook(decisionMode === "store_snack" ? STORE_SNACK_REJECTION_REASONS : COOK_REJECTION_REASONS);

  function renderCook(rejectionReasons: { value: string; label: string }[]) {
    if (feedback.didEat === null) {
      return (
        <Card title="Did you eat this?">
          <SingleChipGroup
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value=""
            onChange={(value) => answer(value === "yes")}
          />
          {saving && <p className="mt-2 text-xs text-muted">Saving…</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </Card>
      );
    }

    if (feedback.didEat) {
      return (
        <Card title="✓ You ate this">
          {feedback.note === null ? (
            <>
              <p className="mb-2 text-xs text-muted">Would you eat this again? (optional)</p>
              <SingleChipGroup options={WOULD_EAT_AGAIN} value="" onChange={answerNote} />
            </>
          ) : (
            <p className="text-xs text-muted">
              Would eat again: {WOULD_EAT_AGAIN.find((o) => o.value === feedback.note)?.label ?? feedback.note}
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </Card>
      );
    }

    return (
      <Card title="Noted — you didn't eat this">
        {feedback.note === null ? (
          <>
            <p className="mb-2 text-xs text-muted">Why not? (optional)</p>
            <SingleChipGroup options={rejectionReasons} value="" onChange={answerNote} />
          </>
        ) : (
          <p className="text-xs text-muted">
            Reason: {rejectionReasons.find((o) => o.value === feedback.note)?.label ?? feedback.note}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </Card>
    );
  }

  function renderOrder(isNearby: boolean) {
    const outcomes = isNearby ? NEARBY_OUTCOMES : ORDER_OUTCOMES;
    const reasons = isNearby ? NEARBY_REJECTION_REASONS : ORDER_REJECTION_REASONS;
    if (feedback.didEat === null) {
      return (
        <Card
          title="What happened?"
          hint={
            isNearby
              ? "Choosing a card just means you're planning to go there."
              : "Choosing a card just means you're planning to order it."
          }
        >
          <SingleChipGroup options={outcomes} value="" onChange={answerOrderOutcome} />
          {saving && <p className="mt-2 text-xs text-muted">Saving…</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </Card>
      );
    }

    if (feedback.didEat) {
      return (
        <Card
          title={
            feedback.note === "ordered_similar"
              ? isNearby
                ? "✓ You went somewhere similar"
                : "✓ You ordered something similar"
              : isNearby
                ? "✓ You went there"
                : "✓ You ordered it"
          }
        >
          {error && <p className="text-xs text-red-600">{error}</p>}
        </Card>
      );
    }

    return (
      <Card title={isNearby ? "Noted — you didn't go there" : "Noted — you didn't order this"}>
        {feedback.note === null ? (
          <>
            <p className="mb-2 text-xs text-muted">What happened? (optional)</p>
            <SingleChipGroup options={reasons} value="" onChange={answerNote} />
          </>
        ) : (
          <p className="text-xs text-muted">
            Reason: {reasons.find((o) => o.value === feedback.note)?.label ?? feedback.note}
          </p>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </Card>
    );
  }
}
