"use client";

import Card from "@/components/ui/Card";
import TagInput from "@/components/ui/TagInput";
import { MultiChipGroup } from "@/components/ui/ChipGroup";

/**
 * A short list of common chips plus free-text extras — the same shape for
 * allergies and for disliked foods, which are otherwise kept strictly separate
 * (an allergy is a safety constraint, a dislike is a preference). Casing and
 * duplicates are normalized on save, see lib/foodTerms.ts.
 */
export default function FoodTermsCard({
  title,
  hint,
  common,
  values,
  placeholder,
  notice,
  onChange,
}: {
  title: string;
  hint: string;
  common: readonly string[];
  values: string[];
  placeholder: string;
  /** Optional one-line nudge shown under the chips. */
  notice?: string | null;
  onChange: (values: string[]) => void;
}) {
  return (
    <Card title={title} hint={hint}>
      <FoodTermsPicker common={common} values={values} placeholder={placeholder} onChange={onChange} />
      {notice && <p className="mt-3 text-xs text-muted">{notice}</p>}
    </Card>
  );
}

/** The chips + typed extras on their own — also used by first-run setup. */
export function FoodTermsPicker({
  common,
  values,
  placeholder,
  onChange,
}: {
  common: readonly string[];
  values: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const isCommon = (value: string) => (common as readonly string[]).includes(value);
  return (
    <div>
      <MultiChipGroup
        options={common}
        values={values.filter(isCommon)}
        onChange={(picked) => onChange([...picked, ...values.filter((v) => !isCommon(v))])}
      />
      <div className="mt-3">
        <TagInput
          placeholder={placeholder}
          values={values.filter((v) => !isCommon(v))}
          onChange={(custom) => onChange([...values.filter(isCommon), ...custom])}
        />
      </div>
    </div>
  );
}
