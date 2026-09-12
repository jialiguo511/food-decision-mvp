"use client";

import Chip from "./Chip";

type Option = { value: string; label: string; hint?: string };

/** Pick exactly one. */
export function SingleChipGroup({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          hint={option.hint}
          selected={value === option.value}
          onClick={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}

/** Pick any number, including none. */
export function MultiChipGroup({
  options,
  values,
  onChange,
}: {
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  function toggle(option: string) {
    onChange(
      values.includes(option)
        ? values.filter((v) => v !== option)
        : [...values, option],
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          selected={values.includes(option)}
          onClick={() => toggle(option)}
        />
      ))}
    </div>
  );
}
