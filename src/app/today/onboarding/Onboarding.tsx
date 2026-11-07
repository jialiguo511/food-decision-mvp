"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { COMMON_ALLERGIES, COMMON_DISLIKES } from "@/lib/options";
import type { ProfileFormValues } from "@/lib/types";
import DietaryPicker from "../../profile/DietaryPicker";
import { FoodTermsPicker } from "../../profile/FoodTermsCard";
import QuestionScreen from "../flow/QuestionScreen";
import { completeOnboarding } from "../actions";

/**
 * First-run setup: only what could make a suggestion wrong — allergies, a
 * dietary pattern, then foods you don't eat. Three screens, no numbers, no
 * goal, no kitchen, no body details
 * (those are offered later, once there is value; see NutritionStep). Every
 * screen skippable with "I'll do this later". Nothing is saved until the end
 * (or "later"), and then only through the same Profile save as Me — see
 * completeOnboarding. Me stays the place to change any of it.
 */
export default function Onboarding({ initial, onDone }: { initial: ProfileFormValues; onDone: () => void }) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  /** Saves and continues to Home. A failed save never traps the user: after
   *  one failure, "Continue anyway" goes on (setup is then offered next time). */
  async function finish() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await completeOnboarding(values);
      if (result.ok) return onDone();
      setError(result.error);
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const view =
    step === 0
      ? {
          title: "Make recommendations yours",
          hint: "Tell us anything we should never recommend.",
          body: (
            <div>
              <p className="mb-2 text-sm font-medium">Allergies</p>
              <FoodTermsPicker common={COMMON_ALLERGIES} values={values.allergies} placeholder="Another allergy…" onChange={(v) => set("allergies", v)} />
              <p className="mt-3 text-xs text-muted">We can&apos;t check ingredients, so always read labels yourself.</p>
            </div>
          ),
        }
      : step === 1
        ? {
            title: "Do you follow a particular diet?",
            hint: "We'll treat it like an allergy: nothing that breaks it. Pick any that apply.",
            body: <DietaryPicker patterns={values.dietary_patterns} other={values.dietary_other} set={set} />,
          }
        : {
            title: "Foods you don't eat",
            hint: "We'll steer away from these. A preference, not a safety rule.",
            body: <FoodTermsPicker common={COMMON_DISLIKES} values={values.dislikes} placeholder="Something else…" onChange={(v) => set("dislikes", v)} />,
          };

  return (
    <QuestionScreen
      stepKey={`setup:${step}`}
      index={step}
      count={3}
      onBack={step > 0 ? () => setStep((step - 1) as 0 | 1) : undefined}
      title={view.title}
      hint={view.hint}
      footer={
        <>
          <Button onClick={step < 2 ? () => setStep((step + 1) as 1 | 2) : finish} disabled={saving}>
            {saving ? "Saving…" : "Continue"}
          </Button>
          <Button variant="quiet" className="w-full" onClick={finish} disabled={saving}>
            I&apos;ll do this later
          </Button>
          {error && (
            <>
              <p role="alert" className="text-center text-sm text-red-600">
                {error}
              </p>
              <Button variant="quiet" className="w-full" onClick={onDone}>
                Continue without saving
              </Button>
            </>
          )}
        </>
      }
    >
      {view.body}
    </QuestionScreen>
  );
}
