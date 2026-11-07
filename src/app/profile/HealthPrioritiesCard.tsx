"use client";

import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import { HEALTH_CONDITIONS, NUTRITION_PRIORITIES } from "@/lib/options";
import { suggestedPriorities } from "@/lib/nutritionPriorities";
import type { HealthCondition, NutritionPriority, ProfileFormValues } from "@/lib/types";

const toggle = <T extends string>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

type FieldProps = {
  values: ProfileFormValues;
  set: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void;
};

/**
 * "Health & nutrition priorities". Two separate, optional questions:
 *  - priorities — what the user wants to limit; this is what recommendations use.
 *  - conditions — context only. A condition can SUGGEST a priority, never turn
 *    one on: the user taps to confirm, and nothing changes until they do.
 * Not medical advice, and no nutrient numbers are tracked here. The two fields
 * are also used on their own by first-run setup.
 */
export default function HealthPrioritiesCard({ values, set }: FieldProps) {
  return (
    <Card
      title="Health & nutrition priorities"
      hint="Optional. Helps us lean toward food that fits — it isn't medical advice."
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm">Anything you&apos;re trying to limit?</p>
          <PrioritiesField values={values} set={set} />
        </div>
        <div>
          <p className="mb-2 text-sm">Health conditions that affect how you eat</p>
          <ConditionsField values={values} set={set} />
        </div>
      </div>
    </Card>
  );
}

/** What the user has confirmed they want to limit — what the recommender reads. */
export function PrioritiesField({ values, set }: FieldProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {NUTRITION_PRIORITIES.map((p) => (
        <Chip
          key={p.value}
          label={p.label}
          hint={p.hint}
          selected={values.nutrition_priorities.includes(p.value)}
          onClick={() => set("nutrition_priorities", toggle(values.nutrition_priorities, p.value))}
        />
      ))}
    </div>
  );
}

/** Conditions, with a one-tap "Use it" for each priority they suggest. */
export function ConditionsField({ values, set }: FieldProps) {
  const suggestions = suggestedPriorities(values.health_conditions, values.nutrition_priorities);
  const label = (p: NutritionPriority) => NUTRITION_PRIORITIES.find((x) => x.value === p)?.label.toLowerCase() ?? p;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {HEALTH_CONDITIONS.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            selected={values.health_conditions.includes(c.value)}
            onClick={() => set("health_conditions", toggle<HealthCondition>(values.health_conditions, c.value))}
          />
        ))}
      </div>
      {suggestions.map((p) => (
        <p key={p} className="mt-3 text-xs text-muted">
          Based on this, you may want to pay more attention to {label(p)}.{" "}
          <button
            type="button"
            onClick={() => set("nutrition_priorities", [...values.nutrition_priorities, p])}
            className="font-medium text-accent"
          >
            Use it
          </button>
        </p>
      ))}
      <p className="mt-3 text-xs text-muted">
        We only support these three. If your needs are more complex, follow your care team&apos;s advice — this
        isn&apos;t a substitute.
      </p>
    </div>
  );
}
