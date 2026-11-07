"use client";

import { useState } from "react";
import OptionList from "@/components/ui/OptionList";
import Slider from "@/components/ui/Slider";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import {
  BUDGET_PER_MEAL,
  COMMON_CRAVINGS,
  COOK_MINUTES,
  COOK_SHOPPING_MODES,
  EFFORT_LEVELS,
  EXTRAS_BUDGET_PRESETS,
  HUNGER_LEVELS,
} from "@/lib/options";
import type { BudgetUsual } from "@/lib/recommend/rememberedDefaults";
import { normalizeCraving } from "@/lib/text";
import type { CookForm, CookShopping, Effort, Hunger } from "@/lib/types";
import IngredientsPicker, { StaplesNote } from "./IngredientsPicker";
import type { CookStep } from "./steps";

export type StepView = {
  title: string;
  hint?: string;
  body: React.ReactNode;
  /** false = Continue stays disabled until the question is answered. Absent
   *  means ready (an optional question, or one that always has an answer). */
  ready?: boolean;
};

export type CookQuestionProps = {
  values: CookForm;
  /** Store an answer. Whether it then moves on is decided in one place —
   *  autoAdvances() in steps.ts — never by the question itself. */
  onChange: (values: CookForm) => void;
  /** A budget that may honestly be offered as "My usual" / "Last time"; null
   *  for someone who has neither, who then just picks one. */
  budgetUsual: BudgetUsual | null;
  kitchenStaples: string[];
};

const NO_CRAVING = "__none__";

export function cookQuestion(step: CookStep, p: CookQuestionProps): StepView {
  const { values } = p;
  switch (step) {
    case "hunger":
      return {
        title: "How hungry are you?",
        body: (
          <OptionList
            label="How hungry are you?"
            options={HUNGER_LEVELS}
            value={values.hunger}
            onPick={(v) => p.onChange({ ...values, hunger: v as Hunger })}
          />
        ),
      };
    case "time_effort":
      return {
        title: "How much time and effort?",
        ready: values.cook_minutes !== null && values.effort !== null,
        body: (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">Time</p>
              <SingleChipGroup
                options={COOK_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
                // Nothing is selected until the user (or a real earlier answer) says so.
                value={values.cook_minutes === null ? "" : String(values.cook_minutes)}
                onChange={(v) => p.onChange({ ...values, cook_minutes: Number(v) })}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Cooking</p>
              <OptionList
                label="How much do you want to cook?"
                options={EFFORT_LEVELS}
                value={values.effort ?? ""}
                onPick={(v) => p.onChange({ ...values, effort: v as Effort })}
              />
            </div>
          </div>
        ),
      };
    case "shopping":
      return {
        title: "Shopping tonight?",
        body: (
          <OptionList
            label="Shopping tonight?"
            options={COOK_SHOPPING_MODES}
            value={values.shopping ?? ""}
            // Picking by hand ends the "fewest items" fallback — that is only
            // meant for the run started by "Show me what to buy".
            onPick={(v) => p.onChange({ ...values, shopping: v as CookShopping, minimize_purchases: false })}
          />
        ),
      };
    case "budget":
      return {
        title: "How much for extras?",
        hint: "Only what you'd spend tonight on missing ingredients.",
        ready: values.budget_override_usd !== null,
        body: <BudgetBody {...p} />,
      };
    case "ingredients":
      return {
        title: "What do you have right now?",
        hint: "We'll only suggest meals from what you add here and your kitchen staples — nothing to buy. Nothing is saved for next time.",
        body: (
          <div className="space-y-4">
            <IngredientsPicker
              values={values.ingredients_on_hand}
              onChange={(items) => p.onChange({ ...values, ingredients_on_hand: items })}
            />
            <StaplesNote kitchenStaples={p.kitchenStaples} />
          </div>
        ),
      };
    case "craving":
      return { title: "Craving anything?", hint: "Optional — skip if nothing comes to mind.", body: <CravingBody {...p} /> };
  }
}

/**
 * Budget for extras. `budget_override_usd` is null until answered. Someone with
 * a real usual (their Profile budget, or what they chose last time) is offered
 * it back, labelled for what it is, next to "Different tonight"; someone
 * without one just picks — there is no invented "usual" to accept. Either way
 * the screen has extra controls, so it moves on only with Continue.
 */
function BudgetBody({ values, onChange, budgetUsual, kitchenStaples }: CookQuestionProps) {
  const budget = values.budget_override_usd;
  // "Different tonight" is a mode of this screen, not a value: tapping it shows
  // the slider (starting at the usual) without having chosen anything new yet.
  const [different, setDifferent] = useState(budgetUsual !== null && budget !== null && budget !== budgetUsual.value);
  // Today's foods are optional when shopping is allowed, so they stay one tap
  // away instead of being their own question — open already if any are set.
  const [showFoods, setShowFoods] = useState(values.ingredients_on_hand.length > 0);

  return (
    <div className="space-y-5">
      {values.minimize_purchases && <p className="text-sm text-accent">Looking for the fewest things to buy.</p>}
      {budgetUsual ? (
        <>
          <OptionList
            label="Budget"
            options={[
              { value: "usual", label: budgetUsual.source === "profile" ? "My usual" : "Last time", hint: `About $${Math.round(budgetUsual.value)}` },
              { value: "different", label: "Different tonight" },
            ]}
            value={different ? "different" : budget === budgetUsual.value ? "usual" : ""}
            onPick={(choice) => {
              setDifferent(choice === "different");
              onChange({ ...values, budget_override_usd: choice === "usual" ? budgetUsual.value : (budget ?? budgetUsual.value) });
            }}
          />
          {different && (
            <div className="animate-fade-in rounded-2xl border border-line bg-card p-4">
              <Slider
                label="Tonight's budget"
                value={budget ?? budgetUsual.value}
                min={BUDGET_PER_MEAL.min}
                max={BUDGET_PER_MEAL.max}
                step={BUDGET_PER_MEAL.step}
                format={(v) => `$${v}`}
                onChange={(v) => onChange({ ...values, budget_override_usd: v })}
              />
            </div>
          )}
        </>
      ) : (
        <OptionList
          label="Budget"
          options={EXTRAS_BUDGET_PRESETS.map((n) => ({ value: String(n), label: `About $${n}` }))}
          value={budget === null ? "" : String(budget)}
          onPick={(v) => onChange({ ...values, budget_override_usd: Number(v) })}
        />
      )}
      {showFoods ? (
        <div className="animate-fade-in">
          <p className="mb-2 text-sm font-medium">Anything you want to use up?</p>
          <IngredientsPicker
            values={values.ingredients_on_hand}
            onChange={(items) => onChange({ ...values, ingredients_on_hand: items })}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowFoods(true)} className="min-h-11 text-sm font-semibold text-accent">
          + Add foods you already have
        </button>
      )}
      <StaplesNote kitchenStaples={kitchenStaples} />
    </div>
  );
}

/** One value, not a tag list: a preset or whatever was typed. Typing clears
 *  every chip, including "No preference". */
function CravingBody({ values, onChange }: CookQuestionProps) {
  const preset =
    values.craving !== null && (COMMON_CRAVINGS as readonly string[]).includes(values.craving) ? values.craving : null;
  const custom = preset === null ? (values.craving ?? "") : "";
  const set = (craving: string | null) => onChange({ ...values, craving });

  return (
    <div>
      <SingleChipGroup
        options={[{ value: NO_CRAVING, label: "No preference" }, ...COMMON_CRAVINGS.map((c) => ({ value: c, label: c }))]}
        value={preset ?? (custom === "" ? NO_CRAVING : "")}
        onChange={(v) => set(v === NO_CRAVING ? null : v)}
      />
      <input
        value={custom}
        // Never trim per keystroke — that deletes the space as it's typed.
        // Normalized on blur and again when the request is made.
        onChange={(e) => set(e.target.value || null)}
        onBlur={(e) => set(normalizeCraving(e.target.value))}
        placeholder="Or describe what sounds good…"
        aria-label="Describe your craving"
        className={`mt-4 min-h-12 w-full rounded-2xl bg-card px-4 outline-none ${
          custom === "" ? "border border-line focus:border-accent" : "border border-accent text-accent"
        }`}
      />
    </div>
  );
}
