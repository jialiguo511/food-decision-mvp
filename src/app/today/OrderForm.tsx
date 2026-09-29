"use client";

import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { HUNGER_LEVELS, MEAL_BUDGETS, ORDER_CRAVINGS, ORDER_METHODS, TRAVEL_OPTIONS } from "@/lib/options";
import { normalizeCraving } from "@/lib/text";
import type { Hunger, MealBudget, OrderContext, OrderCravingCategory, OrderMethod, TravelWillingness } from "@/lib/types";

/**
 * The "I want to order food" half of Today's dynamic context. Deliberately
 * short questions — see PRODUCT.md → "Order Food": goal, protein target, and
 * dislikes are reused from the profile rather than asked again. The budget
 * here is the total for this meal, unlike Cook's extra-ingredient budget.
 */
export default function OrderForm({
  values,
  onChange,
}: {
  values: OrderContext;
  onChange: (values: OrderContext) => void;
}) {
  function set<K extends keyof OrderContext>(key: K, value: OrderContext[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <>
      <Card title="How hungry are you?">
        <SingleChipGroup
          options={HUNGER_LEVELS}
          value={values.hunger}
          onChange={(value) => set("hunger", value as Hunger)}
        />
      </Card>

      <Card title="Craving anything?" hint="Pick what's closest. Add specifics below if you want.">
        <SingleChipGroup
          options={ORDER_CRAVINGS}
          value={values.craving_category}
          onChange={(value) => set("craving_category", value as OrderCravingCategory)}
        />
        <input
          value={values.craving_note ?? ""}
          // Same reasoning as CookForm's craving box: don't trim on keystroke,
          // only when the value is finalized.
          onChange={(event) => set("craving_note", event.target.value || null)}
          onBlur={(event) => set("craving_note", normalizeCraving(event.target.value))}
          placeholder="Something specific? e.g. fried chicken, sushi, burritos…"
          aria-label="Describe a specific craving"
          className="mt-3 w-full rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent"
        />
      </Card>

      <Card title="How are you getting food?">
        <SingleChipGroup
          options={ORDER_METHODS}
          value={values.method}
          onChange={(value) => set("method", value as OrderMethod)}
        />
      </Card>

      {/* Only Eat nearby has a "how far" to ask — delivery and pickup don't. */}
      {values.method === "eat_nearby" && (
        <Card title="How far would you go?">
          <SingleChipGroup
            options={TRAVEL_OPTIONS}
            value={values.travel_willingness}
            onChange={(value) => set("travel_willingness", value as TravelWillingness)}
          />
        </Card>
      )}

      <Card title="What's your budget?">
        <SingleChipGroup
          options={MEAL_BUDGETS}
          value={values.meal_budget}
          onChange={(value) => set("meal_budget", value as MealBudget)}
        />
      </Card>
    </>
  );
}
