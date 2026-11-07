"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import OptionList from "@/components/ui/OptionList";
import { GOALS } from "@/lib/options";
import type { Goal, ProfileFormValues } from "@/lib/types";
import { AboutYouFields } from "../../profile/AboutYouFields";
import { createAdvanceScheduler } from "../flow/advance";
import QuestionScreen from "../flow/QuestionScreen";
import { completeNutritionStep } from "../actions";

/**
 * The optional "better portion and protein suggestions" step: offered once,
 * after the user has seen results — never before. Two short screens (what
 * you're going for, then a few details), both pre-filled from the Profile so
 * nothing already stored is asked again. It writes through the same Profile
 * save as Me; "Not now" records only the dismissal.
 */
export default function NutritionStep({
  initial,
  onBack,
  onDone,
  onDismiss,
}: {
  initial: ProfileFormValues;
  onBack: () => void;
  onDone: () => void;
  onDismiss: () => void;
}) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [step, setStep] = useState<0 | 1>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The goal question is a pure single choice: the same beat-then-advance as
  // every other question (flow/advance.ts), cancelled by Back / Continue.
  const advance = useRef(createAdvanceScheduler());
  useEffect(() => {
    const scheduler = advance.current;
    return () => scheduler.cancel();
  }, []);

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await completeNutritionStep(values);
      if (result.ok) return onDone();
      setError(result.error);
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const goal = (
    <OptionList
      label="What are you going for?"
      options={GOALS}
      // Nothing is selected until the user picks one.
      value={values.goal ?? ""}
      onPick={(v) => {
        set("goal", v as Goal);
        advance.current.schedule(() => setStep(1));
      }}
    />
  );

  return (
    <QuestionScreen
      stepKey={`nutrition:${step}`}
      index={step}
      count={2}
      onBack={() => {
        advance.current.cancel();
        if (step === 0) onBack();
        else setStep(0);
      }}
      title={step === 0 ? "What are you going for?" : "A few details"}
      hint={
        step === 0
          ? "Helps size meals and protein. Change it anytime in Me."
          : "Optional — only used to estimate calories and protein. Never shared."
      }
      footer={
        <>
          {step === 0 ? (
            <Button
              onClick={() => {
                advance.current.cancel();
                setStep(1);
              }}
            >
              Continue
            </Button>
          ) : (
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
          <Button variant="quiet" className="w-full" onClick={onDismiss} disabled={saving}>
            Not now
          </Button>
          {error && (
            <p role="alert" className="text-center text-sm text-red-600">
              {error}
            </p>
          )}
        </>
      }
    >
      {step === 0 ? goal : <div className="space-y-5"><AboutYouFields values={values} set={set} /></div>}
    </QuestionScreen>
  );
}
