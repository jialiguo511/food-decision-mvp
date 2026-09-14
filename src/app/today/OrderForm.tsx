"use client";

import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { HUNGER_LEVELS, ORDER_CRAVINGS, ORDER_METHODS } from "@/lib/options";
import { normalizeCraving } from "@/lib/text";
import type { Hunger, OrderContext, OrderCravingCategory, OrderMethod } from "@/lib/types";

/**
 * The "I want to order food" half of Today's dynamic context. Deliberately
 * three short questions — see PRODUCT.md → "Order Food": goal, protein
 * target, and dislikes are reused from the profile rather than asked again.
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
    </>
  );
}
