"use client";

import { SingleChipGroup } from "./ChipGroup";

type Option = { value: string; label: string; hint?: string };

/**
 * One choice that is allowed to stay unanswered. Nothing is selected until the
 * user picks, tapping the selected one clears it, and the unset state says so
 * ("Not set") instead of showing a default as if it were chosen. For
 * persistent preferences in Me — a value shown here is one the user set.
 */
export default function OptionalChoice({
  options,
  value,
  onChange,
  unsetNote = "Not set",
}: {
  options: Option[];
  /** null = not set. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Shown while unset. */
  unsetNote?: string;
}) {
  return (
    <div>
      <SingleChipGroup options={options} value={value ?? ""} onChange={(next) => onChange(next === value ? null : next)} />
      {value === null ? (
        <p className="mt-2 text-xs text-muted">{unsetNote}</p>
      ) : (
        <button type="button" onClick={() => onChange(null)} className="mt-1 min-h-11 text-xs font-medium text-muted underline">
          Clear
        </button>
      )}
    </div>
  );
}
