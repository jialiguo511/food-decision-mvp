"use client";

import { useRef, useState } from "react";
import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { REJECTION_REASONS, WOULD_EAT_AGAIN } from "@/lib/options";
import { recordMealFeedback, setMealFeedbackNote } from "./actions";

export type FeedbackData = {
  /** meal_feedback.id, once a row exists. Null means nothing recorded yet. */
  id: string | null;
  didEat: boolean | null;
  note: string | null;
};

/**
 * The core loop's final step: did the user actually eat the meal they chose?
 * Shown once a card is selected — see RecommendationResults. Writes to the
 * existing meal_feedback table only; no new schema, no rating, no comments.
 *
 * `didEat` and `note` are both write-once: once answered, that question
 * stops rendering and shows the recorded answer instead, and the handlers
 * below also guard against a stale duplicate call landing after the fact.
 */
export default function MealFeedback({
  sessionId,
  mealTitle,
  initial,
}: {
  sessionId: string;
  mealTitle: string;
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
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your answer.");
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
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
      noting.current = false;
    }
  }

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
          <SingleChipGroup options={REJECTION_REASONS} value="" onChange={answerNote} />
        </>
      ) : (
        <p className="text-xs text-muted">
          Reason: {REJECTION_REASONS.find((o) => o.value === feedback.note)?.label ?? feedback.note}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </Card>
  );
}
