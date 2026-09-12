"use client";

import Card from "@/components/ui/Card";
import Slider from "@/components/ui/Slider";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { BUDGET_PER_MEAL } from "@/lib/options";

/**
 * Budget is the one field most nights don't need, so it stays collapsed.
 * `null` means "use the number from my profile" — we only show the slider
 * once the user says tonight is different.
 */
export default function BudgetCard({
  usualBudget,
  value,
  onChange,
}: {
  usualBudget: number;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const overriding = value !== null;

  return (
    <Card title="Budget">
      <SingleChipGroup
        options={[
          { value: "usual", label: "My usual", hint: `About $${usualBudget}` },
          { value: "different", label: "Different tonight" },
        ]}
        value={overriding ? "different" : "usual"}
        onChange={(choice) =>
          onChange(choice === "usual" ? null : Math.round(usualBudget))
        }
      />
      {overriding && (
        <div className="mt-5">
          <Slider
            label="Tonight's budget"
            value={value}
            min={BUDGET_PER_MEAL.min}
            max={BUDGET_PER_MEAL.max}
            step={BUDGET_PER_MEAL.step}
            format={(v) => `$${v}`}
            onChange={onChange}
          />
        </div>
      )}
    </Card>
  );
}
