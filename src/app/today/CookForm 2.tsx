"use client";

import Card from "@/components/ui/Card";
import TagInput from "@/components/ui/TagInput";
import { MultiChipGroup, SingleChipGroup } from "@/components/ui/ChipGroup";
import { COMMON_CRAVINGS, COOK_MINUTES, EFFORT_LEVELS, HUNGER_LEVELS, QUICK_INGREDIENTS } from "@/lib/options";
import { normalizeCraving } from "@/lib/text";
import type { Effort, Hunger, MealContext } from "@/lib/types";
import BudgetCard from "./BudgetCard";

const NO_CRAVING = "__none__";

/** The "I can cook" half of Today's dynamic context — the original flow,
 *  extracted out of TodayForm so it sits alongside OrderForm. */
export default function CookForm({
  values,
  onChange,
  usualBudget,
}: {
  values: MealContext;
  onChange: (values: MealContext) => void;
  usualBudget: number;
}) {
  function set<K extends keyof MealContext>(key: K, value: MealContext[K]) {
    onChange({ ...values, [key]: value });
  }

  // The craving is a single value, not a tag list: either one of the presets or
  // whatever the user typed. Splitting it into these two derived values is what
  // lets a typed phrase deselect every chip, including "No preference".
  const preset =
    values.craving !== null && (COMMON_CRAVINGS as readonly string[]).includes(values.craving)
      ? values.craving
      : null;
  const customCraving = preset === null ? (values.craving ?? "") : "";

  return (
    <>
      <Card title="How long do you have?">
        <SingleChipGroup
          options={COOK_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
          value={String(values.cook_minutes)}
          onChange={(value) => set("cook_minutes", Number(value))}
        />
      </Card>

      <Card title="How hungry are you?">
        <SingleChipGroup
          options={HUNGER_LEVELS}
          value={values.hunger}
          onChange={(value) => set("hunger", value as Hunger)}
        />
      </Card>

      <Card title="How much do you want to cook?">
        <SingleChipGroup
          options={EFFORT_LEVELS}
          value={values.effort}
          onChange={(value) => set("effort", value as Effort)}
        />
      </Card>

      <Card title="Craving anything?" hint="Tap one, or just describe it. Skip if nothing comes to mind.">
        <SingleChipGroup
          options={[
            { value: NO_CRAVING, label: "No preference" },
            ...COMMON_CRAVINGS.map((c) => ({ value: c, label: c })),
          ]}
          // An empty value matches no option, so typing clears every chip.
          value={preset ?? (customCraving === "" ? NO_CRAVING : "")}
          onChange={(value) => set("craving", value === NO_CRAVING ? null : value)}
        />
        <input
          value={customCraving}
          // Do NOT trim here. This is a controlled input, so trimming on each
          // keystroke deletes the space the instant it is typed and the user
          // can never write more than one word. Normalizing happens on blur
          // and again when the context is captured.
          onChange={(event) => set("craving", event.target.value || null)}
          onBlur={(event) => set("craving", normalizeCraving(event.target.value))}
          placeholder="Or describe what sounds good…"
          aria-label="Describe your craving"
          className={`mt-3 w-full rounded-xl bg-card px-3 py-2 outline-none ${
            // Match the chips: when the typed text is the active craving, the
            // box is styled like a selected chip. That is the feedback that
            // says "this counts" — no Add button required.
            customCraving === "" ? "border border-line focus:border-accent" : "border border-accent text-accent"
          }`}
        />
      </Card>

      <Card title="Anything you want to use up?" hint="Optional. Helps us suggest something you can start right now.">
        <MultiChipGroup
          options={QUICK_INGREDIENTS}
          values={values.ingredients_on_hand.filter((i) => (QUICK_INGREDIENTS as readonly string[]).includes(i))}
          onChange={(picked) => {
            const custom = values.ingredients_on_hand.filter(
              (i) => !(QUICK_INGREDIENTS as readonly string[]).includes(i),
            );
            set("ingredients_on_hand", [...picked, ...custom]);
          }}
        />
        <div className="mt-3">
          <TagInput
            placeholder="Something else in the fridge…"
            values={values.ingredients_on_hand.filter((i) => !(QUICK_INGREDIENTS as readonly string[]).includes(i))}
            onChange={(custom) => {
              const picked = values.ingredients_on_hand.filter((i) =>
                (QUICK_INGREDIENTS as readonly string[]).includes(i),
              );
              set("ingredients_on_hand", [...picked, ...custom]);
            }}
          />
        </div>
      </Card>

      <BudgetCard
        usualBudget={usualBudget}
        value={values.budget_override_usd}
        onChange={(value) => set("budget_override_usd", value)}
      />
    </>
  );
}
