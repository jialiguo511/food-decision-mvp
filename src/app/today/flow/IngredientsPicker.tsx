"use client";

import Link from "next/link";
import TagInput from "@/components/ui/TagInput";
import { MultiChipGroup } from "@/components/ui/ChipGroup";
import { QUICK_INGREDIENTS } from "@/lib/options";

const isQuick = (item: string) => (QUICK_INGREDIENTS as readonly string[]).includes(item);

/** "What do you have right now?" — the food available for THIS meal: one-tap
 *  chips plus typed extras. Lives only in the form state and the request;
 *  never saved (CLAUDE.md → "Kitchen staples vs. today's food"). */
export default function IngredientsPicker({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div>
      <MultiChipGroup
        options={QUICK_INGREDIENTS}
        values={values.filter(isQuick)}
        onChange={(picked) => onChange([...picked, ...values.filter((i) => !isQuick(i))])}
      />
      <div className="mt-3">
        <TagInput
          placeholder="Add another food…"
          values={values.filter((i) => !isQuick(i))}
          onChange={(custom) => onChange([...values.filter(isQuick), ...custom])}
        />
      </div>
    </div>
  );
}

/** Says which condiments and seasonings are also available, so one showing up
 *  in a recipe is never a surprise. Rendered once per question, whether or not
 *  the foods picker is open. Nothing when there are none. */
export function StaplesNote({ kitchenStaples }: { kitchenStaples: string[] }) {
  if (kitchenStaples.length === 0) return null;
  return (
    <p className="text-xs text-muted">
      Also using your kitchen staples: {kitchenStaples.join(" · ")}.{" "}
      <Link href="/profile" className="font-medium text-accent">
        Edit
      </Link>
    </p>
  );
}
