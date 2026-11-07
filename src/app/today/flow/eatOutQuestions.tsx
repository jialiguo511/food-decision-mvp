"use client";

import OptionList from "@/components/ui/OptionList";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import {
  HUNGER_LEVELS,
  MEAL_BUDGETS,
  ORDER_CRAVINGS,
  ORDER_METHODS,
  STORE_SNACK_CRAVINGS,
  TRAVEL_OPTIONS,
} from "@/lib/options";
import { normalizeCraving } from "@/lib/text";
import type {
  CravingType,
  Hunger,
  MealBudget,
  OrderContext,
  OrderCravingCategory,
  OrderMethod,
  StoreSnackContext,
  TravelWillingness,
} from "@/lib/types";
import type { StepView } from "./cookQuestions";
import type { OrderStep, SnackStep } from "./steps";

type Props<T> = { values: T; onChange: (values: T) => void; onPick: (values: T) => void };

/** Get food. Goal, protein and dislikes come from the Profile, never asked
 *  here. The budget is the whole meal's — not Cook's extra-ingredient budget. */
export function orderQuestion(step: OrderStep, { values, onChange, onPick }: Props<OrderContext>): StepView {
  switch (step) {
    case "method":
      return {
        title: "How are you getting food?",
        body: (
          <OptionList
            label="How are you getting food?"
            options={ORDER_METHODS}
            value={values.method}
            // The travel answer stays in state while Delivery hides its question.
            onPick={(v) => onPick({ ...values, method: v as OrderMethod })}
          />
        ),
      };
    case "hunger":
      return {
        title: "How hungry are you?",
        body: (
          <OptionList
            label="How hungry are you?"
            options={HUNGER_LEVELS}
            value={values.hunger}
            onPick={(v) => onPick({ ...values, hunger: v as Hunger })}
          />
        ),
      };
    case "craving":
      return {
        title: "Craving anything?",
        hint: "Pick what's closest. Add specifics if you want.",
        body: (
          <div>
            <SingleChipGroup
              options={ORDER_CRAVINGS}
              value={values.craving_category}
              onChange={(v) => onChange({ ...values, craving_category: v as OrderCravingCategory })}
            />
            <input
              value={values.craving_note ?? ""}
              // Same as Cook's craving box: trimmed only once finalized.
              onChange={(e) => onChange({ ...values, craving_note: e.target.value || null })}
              onBlur={(e) => onChange({ ...values, craving_note: normalizeCraving(e.target.value) })}
              placeholder="Something specific? e.g. sushi, burritos…"
              aria-label="Describe a specific craving"
              className="mt-4 min-h-12 w-full rounded-2xl border border-line bg-card px-4 outline-none focus:border-accent"
            />
          </div>
        ),
      };
    case "budget":
      return {
        title: "What's your budget?",
        hint: "For the whole meal.",
        body: (
          <OptionList
            label="What's your budget?"
            options={MEAL_BUDGETS}
            value={values.meal_budget}
            onPick={(v) => onPick({ ...values, meal_budget: v as MealBudget })}
          />
        ),
      };
    case "travel":
      return {
        title: "How far would you go?",
        body: (
          <OptionList
            label="How far would you go?"
            options={TRAVEL_OPTIONS}
            value={values.travel_willingness}
            onPick={(v) => onChange({ ...values, travel_willingness: v as TravelWillingness })}
          />
        ),
      };
  }
}

/** Grab a snack — deliberately the lightest flow: no store or inventory data
 *  exists behind it, so there's nothing else to ask. */
export function snackQuestion(step: SnackStep, { values, onChange, onPick }: Props<StoreSnackContext>): StepView {
  if (step === "hunger") {
    return {
      title: "How hungry are you?",
      body: (
        <OptionList
          label="How hungry are you?"
          options={HUNGER_LEVELS}
          value={values.hunger}
          onPick={(v) => onPick({ ...values, hunger: v as Hunger })}
        />
      ),
    };
  }
  return {
    title: "What sounds good?",
    body: (
      <OptionList
        label="What sounds good?"
        options={STORE_SNACK_CRAVINGS}
        value={values.craving_type}
        onPick={(v) => onChange({ ...values, craving_type: v as CravingType })}
      />
    ),
  };
}
