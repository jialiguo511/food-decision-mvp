"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { COMMON_ALLERGIES } from "@/lib/options";
import type { ProfileFormValues } from "@/lib/types";
import DietaryPicker from "../../profile/DietaryPicker";
import { FoodTermsPicker } from "../../profile/FoodTermsCard";
import QuestionScreen from "../flow/QuestionScreen";
import { completeOnboarding } from "../actions";

/**
 * First-run setup: only what could make a suggestion WRONG — allergies and a dietary
 * pattern. Two screens, no numbers, no goal, no kitchen, no body details, and no soft
 * preferences (foods you don't eat live in Me): those never stand between a new person
 * and their first answer. Nothing here is a gate — every screen can be skipped, and a
 * skipped allergy question stays "not set" (we do NOT turn it into "no allergies": the
 * app doesn't know). Saying there are none is its own explicit answer.
 *
 * Nothing is saved until the end (or "later"), and then only through the same Profile
 * save as Me — see completeOnboarding. Me stays the place to change any of it.
 */
export default function Onboarding({ initial, onDone }: { initial: ProfileFormValues; onDone: () => void }) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [step, setStep] = useState<0 | 1>(0);
  /** "No known allergies" — an explicit answer, only meaningful while none are listed. */
  const [noAllergies, setNoAllergies] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const listed = values.allergies.length > 0;
  const allergiesAnswered = listed || noAllergies;

  /** Saves and continues to Home. A failed save never traps the user: after
   *  one failure, "Continue without saving" goes on (setup is then offered next time). */
  async function finish() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await completeOnboarding(values, { noKnownAllergies: noAllergies && !listed });
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
          title: "Any food allergies?",
          hint: "Anything we should never recommend. We'll treat it as a hard rule.",
          body: (
            <div>
              <FoodTermsPicker
                common={COMMON_ALLERGIES}
                values={values.allergies}
                placeholder="Another allergy…"
                onChange={(v) => {
                  set("allergies", v);
                  if (v.length > 0) setNoAllergies(false);
                }}
              />
              {!listed && (
                <button
                  type="button"
                  aria-pressed={noAllergies}
                  onClick={() => setNoAllergies((on) => !on)}
                  className={`mt-4 flex min-h-12 w-full items-center justify-between rounded-2xl border px-4 text-left text-sm font-semibold transition-colors ${noAllergies ? "border-accent bg-accent-soft/50 text-ink" : "border-line bg-card text-ink/80"}`}
                >
                  No known food allergies
                  <span aria-hidden className={`size-5 rounded-full border ${noAllergies ? "border-accent bg-accent" : "border-line"}`} />
                </button>
              )}
              <p className="mt-3 text-xs text-muted">We can&apos;t check ingredients, so always read labels yourself. Not sure? Skip — we won&apos;t assume you have none.</p>
            </div>
          ),
        }
      : {
          title: "Do you follow a particular diet?",
          hint: "We'll treat it like an allergy: nothing that breaks it. Pick any that apply, or skip.",
          body: <DietaryPicker patterns={values.dietary_patterns} other={values.dietary_other} set={set} />,
        };

  return (
    <QuestionScreen
      stepKey={`setup:${step}`}
      index={step}
      count={2}
      onBack={step > 0 ? () => setStep(0) : undefined}
      title={view.title}
      hint={view.hint}
      footer={
        <>
          {step === 0 ? (
            <>
              <Button onClick={() => setStep(1)} disabled={saving || !allergiesAnswered}>
                {allergiesAnswered ? "Continue" : "Choose an answer to continue"}
              </Button>
              <Button variant="quiet" className="w-full" onClick={() => setStep(1)} disabled={saving}>
                Skip for now — leave allergies unset
              </Button>
            </>
          ) : (
            <>
              <Button onClick={finish} disabled={saving}>
                {saving ? "Saving…" : "Continue"}
              </Button>
              <Button variant="quiet" className="w-full" onClick={finish} disabled={saving}>
                Skip
              </Button>
            </>
          )}
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
