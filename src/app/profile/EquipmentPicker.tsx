"use client";

import { MultiChipGroup } from "@/components/ui/ChipGroup";
import { EQUIPMENT } from "@/lib/options";

const NO_COOKING = "No cooking at all";

/**
 * Pick everything you can cook with. "No cooking at all" is the one exclusive
 * answer — it can't be combined with an appliance, so choosing either side
 * clears the other. An empty selection means "not answered", never "no
 * appliances" (that is "No cooking at all"). Shared by Me and the question
 * Cook asks the first time.
 */
export default function EquipmentPicker({ values, onChange }: { values: string[]; onChange: (values: string[]) => void }) {
  return (
    <MultiChipGroup
      options={EQUIPMENT}
      values={values}
      onChange={(next) => {
        const added = next.find((item) => !values.includes(item));
        if (added === NO_COOKING) return onChange([NO_COOKING]);
        onChange(next.filter((item) => item !== NO_COOKING || next.length === 1));
      }}
    />
  );
}
