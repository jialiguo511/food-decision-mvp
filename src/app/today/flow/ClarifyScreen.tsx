"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import OptionList from "@/components/ui/OptionList";
import { COOK_MINUTES, EFFORT_LEVELS, ORDER_METHODS } from "@/lib/options";
import type { CookForm, DecisionMode, Effort, OrderContext } from "@/lib/types";
import { cookQuestion } from "./cookQuestions";
import { cookReady, missingCook, missingOrder, type ClarifyStep } from "./interpret";
import type { FormValues } from "./QuestionFlow";
import { BackButton } from "./QuestionScreen";
import { MODE_LABELS, ModeRow } from "./StartScreen";
import { ctaLabel } from "./summary";

const HEADINGS: Record<ClarifyStep, string> = {
  time_effort: "Time and effort",
  shopping: "Shopping tonight?",
  budget: "How much for extras?",
  ingredients: "What do you have right now?",
  method: "How are you getting food?",
};

/**
 * After a sentence that left something out: ONLY what the request cannot go
 * without, on one screen — not the questionnaire again. Everything the person
 * said (or a real earlier answer supplied) stays as it is. The controls are the
 * question flow's own, so an answer means the same thing here as there.
 *
 * What is asked can grow by one: choosing "I can buy a few things" makes the
 * budget necessary. An answered question stays visible so it can be changed.
 */
export default function ClarifyScreen({
  mode,
  forms,
  setForm,
  initialMissing,
  remembered,
  kitchenStaples,
  budgetUsual,
  onFind,
  onBack,
}: {
  mode: DecisionMode;
  forms: FormValues;
  setForm: <M extends DecisionMode>(mode: M, values: FormValues[M]) => void;
  initialMissing: ClarifyStep[];
  /** Eat out only: a real earlier session already answered how they get food. */
  remembered: boolean;
  kitchenStaples: string[];
  budgetUsual: Parameters<typeof cookQuestion>[1]["budgetUsual"];
  /** `answered`: every question that was on this screen — those answers are the person's own. */
  onFind: (answered: ClarifyStep[]) => void;
  onBack: () => void;
}) {
  // Once shown, a question stays shown. `methodPicked`: Eat out's method has a
  // preselected starting choice that is NOT an answer until the person taps.
  const [asked, setAsked] = useState<ClarifyStep[]>(initialMissing);
  const [methodPicked, setMethodPicked] = useState(false);
  // Time and effort are one question, but if the sentence gave one of them only
  // the other is asked — what was said is never put back in front of the person.
  const [timeKnown] = useState(forms.cook.cook_minutes !== null);
  const [effortKnown] = useState(forms.cook.effort !== null);

  const now: ClarifyStep[] = mode === "cook" ? missingCook(forms.cook) : mode === "order" ? missingOrder(remembered || methodPicked) : [];
  const shown = [...asked, ...now.filter((s) => !asked.includes(s))];
  if (shown.length !== asked.length) setAsked(shown);
  const ready = now.length === 0;

  const cook = forms.cook;
  const sections: Partial<Record<ClarifyStep, React.ReactNode>> = {};
  const setCook = (v: CookForm) => setForm("cook", v);
  if (mode === "cook") {
    for (const step of ["shopping", "budget", "ingredients"] as const) {
      sections[step] = cookQuestion(step, { values: cook, onChange: setCook, budgetUsual, kitchenStaples }).body;
    }
    sections.time_effort = (
      <div className="space-y-5">
        {!timeKnown && (
          <SingleChipGroup
            options={COOK_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
            value={cook.cook_minutes === null ? "" : String(cook.cook_minutes)}
            onChange={(v) => setCook({ ...cook, cook_minutes: Number(v) })}
          />
        )}
        {!effortKnown && (
          <OptionList label="How much do you want to cook?" options={EFFORT_LEVELS} value={cook.effort ?? ""} onPick={(v) => setCook({ ...cook, effort: v as Effort })} />
        )}
      </div>
    );
  } else if (mode === "order") {
    const order: OrderContext = forms.order;
    sections.method = (
      <OptionList
        label="How are you getting food?"
        options={ORDER_METHODS}
        value={remembered || methodPicked ? order.method : ""}
        onPick={(v) => {
          setMethodPicked(true);
          setForm("order", { ...order, method: v as OrderContext["method"] });
        }}
      />
    );
  }

  const form = forms[mode];
  const nearby = mode === "order" && forms.order.method !== "delivery" && (remembered || methodPicked);
  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="animate-step-in pt-4">
        <h2 className="text-2xl font-semibold tracking-tight">{MODE_LABELS[mode].title}</h2>
        <p className="mt-1.5 text-sm text-muted">Just {shown.length === 1 ? "one thing" : "a couple of things"} I couldn&apos;t tell from what you said.</p>
        <div className="mt-5 space-y-6">
          {shown.map((step) => (
            <section key={step} aria-label={HEADINGS[step]}>
              <h3 className="mb-2 text-sm font-medium">{step === "time_effort" ? (timeKnown ? "Cooking" : effortKnown ? "Time" : HEADINGS[step]) : HEADINGS[step]}</h3>
              {sections[step]}
            </section>
          ))}
        </div>
        <div className="mt-6 space-y-2">
          <Button onClick={() => onFind(shown)} disabled={!ready || (mode === "cook" && !cookReady(cook))}>
            {ctaLabel(form)}
          </Button>
          {nearby && <p className="text-center text-xs text-muted">Uses your location once for this search. It isn&apos;t saved.</p>}
        </div>
      </div>
    </div>
  );
}

/** The sentence didn't say what kind of help it wanted. Three taps, then the
 *  usual path — everything else it said is kept. */
export function KindScreen({ onPick, onBack }: { onPick: (mode: DecisionMode) => void; onBack: () => void }) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="animate-step-in pt-4">
        <h2 className="text-2xl font-semibold tracking-tight">What kind of help?</h2>
        <p className="mt-1.5 text-sm text-muted">I couldn&apos;t tell from what you said.</p>
        <div className="mt-5 space-y-3">
          {(["cook", "order", "store_snack"] as const).map((mode) => (
            <ModeRow key={mode} mode={mode} onClick={() => onPick(mode)} />
          ))}
        </div>
      </div>
    </div>
  );
}
