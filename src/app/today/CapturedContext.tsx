"use client";

import { EFFORT_LEVELS, HUNGER_LEVELS } from "@/lib/options";
import type { MealContext } from "@/lib/types";

/**
 * TEMPORARY DEVELOPER / DEBUG UI — not part of the intended consumer
 * experience. It exists only so the Today form can be validated on its own
 * while the context object is still being settled, and normal users should
 * never be shown a raw context dump.
 *
 * Once the recommendation API and the results flow exist, "Find my meal" must
 * lead to the recommendation experience instead of rendering this panel, and
 * this component should be deleted rather than hidden behind a flag.
 *
 * Nothing else on the Today page needs to change when that happens: the object
 * shown here is already the shape the prompt builder wants.
 */
export default function CapturedContext({
  context,
  usualBudget,
}: {
  context: MealContext;
  usualBudget: number;
}) {
  const hunger = HUNGER_LEVELS.find((h) => h.value === context.hunger)?.label;
  const effort = EFFORT_LEVELS.find((e) => e.value === context.effort)?.label;

  const lines: [string, string][] = [
    ["Time", `${context.cook_minutes} min`],
    ["Hunger", hunger ?? context.hunger],
    ["Effort", effort ?? context.effort],
    ["Craving", context.craving ?? "No preference"],
    [
      "On hand",
      context.ingredients_on_hand.length > 0
        ? context.ingredients_on_hand.join(", ")
        : "Nothing in particular",
    ],
    [
      "Budget",
      context.budget_override_usd === null
        ? `Usual (about $${usualBudget})`
        : `$${context.budget_override_usd} tonight`,
    ],
  ];

  return (
    <section
      role="status"
      className="rounded-2xl border border-dashed border-accent/40 bg-accent-soft/50 p-5"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-accent">
        Context captured
      </p>
      <p className="mt-1 text-xs text-muted">
        This is what we&apos;ll send to the recommender.
      </p>

      <dl className="mt-4 space-y-2">
        {lines.map(([label, value]) => (
          <div key={label} className="flex gap-3 text-sm">
            <dt className="w-20 shrink-0 text-muted">{label}</dt>
            <dd className="min-w-0 flex-1 font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-muted">
          Raw MealContext
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-card p-3 text-[11px] leading-relaxed">
          {JSON.stringify(context, null, 2)}
        </pre>
      </details>
    </section>
  );
}
