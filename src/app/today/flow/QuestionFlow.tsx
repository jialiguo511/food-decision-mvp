"use client";

import Button from "@/components/ui/Button";
import type { BudgetUsual } from "@/lib/recommend/rememberedDefaults";
import type { CookForm, DecisionMode, OrderContext, StoreSnackContext } from "@/lib/types";
import { cookQuestion, type StepView } from "./cookQuestions";
import { orderQuestion, snackQuestion } from "./eatOutQuestions";
import QuestionScreen from "./QuestionScreen";
import { ctaLabel } from "./summary";
import { autoAdvances, cookSteps, orderSteps, searchesNearby, snackSteps, type CookStep, type OrderStep, type SnackStep, type Step } from "./steps";

export type FormValues = { cook: CookForm; order: OrderContext; store_snack: StoreSnackContext };

/**
 * The current question for one mode. A pure single choice moves on by itself
 * after a beat (steps.ts → autoAdvances — the one rule); on the last question
 * that move is sending the request. Every other kind of screen (several
 * controls, multi-select, typed text, a choice that reveals more) waits for
 * its button, and every screen keeps its button so a preselected answer can be
 * accepted as is.
 */
export default function QuestionFlow({
  mode,
  step,
  forms,
  setForm,
  onNext,
  onBack,
  onFinish,
  onIdeasByType,
  budgetUsual,
  kitchenStaples,
}: {
  mode: DecisionMode;
  step: number;
  forms: FormValues;
  setForm: <M extends DecisionMode>(mode: M, values: FormValues[M]) => void;
  /** Move on from question `from`; `auto` = after a short beat (a tap). */
  onNext: (stepCount: number, auto: boolean, from: number) => void;
  onBack: () => void;
  /** Send the request. `auto` = after a short beat, from a tap on the last
   *  question (a pure single choice). */
  onFinish: (auto: boolean) => void;
  /** Eat out only: food ideas by type instead of a nearby search. */
  onIdeasByType: () => void;
  budgetUsual: BudgetUsual | null;
  kitchenStaples: string[];
}) {
  let steps: Step[];
  let view: StepView;
  // Stores an answer and, only for a question the rule says moves on by itself,
  // advances (or, from the last question, sends the request) — the one place
  // that happens.
  const answer = <V,>(store: (v: V) => void, list: (v: V) => Step[], at: Step, from: number) => (v: V) => {
    store(v);
    if (!autoAdvances(mode, at)) return;
    const next = list(v);
    if (from >= next.length - 1) onFinish(true);
    else onNext(next.length, true, from);
  };

  if (mode === "cook") {
    const list = cookSteps(forms.cook);
    const from = Math.min(step, list.length - 1);
    const at = list[from] as CookStep;
    steps = list;
    view = cookQuestion(at, {
      values: forms.cook,
      onChange: answer((v: CookForm) => setForm("cook", v), (v: CookForm) => cookSteps(v), at, from),
      budgetUsual,
      kitchenStaples,
    });
  } else if (mode === "order") {
    const list = orderSteps(forms.order);
    const from = Math.min(step, list.length - 1);
    const at = list[from] as OrderStep;
    const change = answer((v: OrderContext) => setForm("order", v), orderSteps, at, from);
    steps = list;
    view = orderQuestion(at, { values: forms.order, onChange: change, onPick: change });
  } else {
    const list = snackSteps();
    const from = Math.min(step, list.length - 1);
    const at = list[from] as SnackStep;
    const change = answer((v: StoreSnackContext) => setForm("store_snack", v), snackSteps, at, from);
    steps = list;
    view = snackQuestion(at, { values: forms.store_snack, onChange: change, onPick: change });
  }

  const index = Math.min(step, steps.length - 1);
  const isLast = index === steps.length - 1;
  const nearby = mode === "order" && searchesNearby(forms.order);
  const cta = ctaLabel(forms[mode]);
  const ready = view.ready !== false;

  return (
    <QuestionScreen
      stepKey={`${mode}:${steps[index]}`}
      index={index}
      count={steps.length}
      onBack={onBack}
      title={view.title}
      hint={view.hint}
      footer={
        !isLast ? (
          <Button onClick={() => onNext(steps.length, false, index)} disabled={!ready}>
            Continue
          </Button>
        ) : nearby ? (
          <>
            <Button onClick={() => onFinish(false)} disabled={!ready}>
              {cta}
            </Button>
            <p className="text-center text-xs text-muted">Uses your location once for this search. It isn&apos;t saved.</p>
            <Button variant="quiet" onClick={onIdeasByType} className="w-full">
              Get food ideas by type instead
            </Button>
          </>
        ) : (
          <Button onClick={() => onFinish(false)} disabled={!ready}>
            {cta}
          </Button>
        )
      }
    >
      {view.body}
    </QuestionScreen>
  );
}
