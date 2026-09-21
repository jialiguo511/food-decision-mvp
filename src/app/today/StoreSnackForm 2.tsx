"use client";

import Card from "@/components/ui/Card";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { HUNGER_LEVELS, STORE_SNACK_CRAVINGS } from "@/lib/options";
import type { CravingType, Hunger, StoreSnackContext } from "@/lib/types";

/**
 * The "grab a snack" half of Today's dynamic context — deliberately the
 * lightest of the three: no store, location, or inventory data exists behind
 * this product, so there is nothing else to ask. Goal, protein target, and
 * dislikes are reused from the profile, same as the other modes.
 */
export default function StoreSnackForm({
  values,
  onChange,
}: {
  values: StoreSnackContext;
  onChange: (values: StoreSnackContext) => void;
}) {
  function set<K extends keyof StoreSnackContext>(key: K, value: StoreSnackContext[K]) {
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

      <Card title="Craving anything specific?">
        <SingleChipGroup
          options={STORE_SNACK_CRAVINGS}
          value={values.craving_type}
          onChange={(value) => set("craving_type", value as CravingType)}
        />
      </Card>
    </>
  );
}
