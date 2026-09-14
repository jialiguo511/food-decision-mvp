"use client";

import { useState } from "react";
import { CALORIE_TARGET } from "@/lib/options";

/**
 * Optional daily calorie target. Typed rather than a slider: people either know
 * their number or don't have one, and a slider can't say "none". Blank means
 * no target. Range is checked when saving, not while typing.
 */
export default function CalorieTargetField({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor="daily-calorie-target" className="text-sm">
          Daily calorie target
        </label>
        <span className="text-xs text-muted">Optional</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          id="daily-calorie-target"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={`e.g. ${CALORIE_TARGET.min + 800}`}
          value={draft}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "").slice(0, 4);
            setDraft(digits);
            onChange(digits === "" ? null : Number(digits));
          }}
          className="w-28 rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent"
        />
        <span className="text-sm text-muted">kcal / day</span>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Leave blank if you don&apos;t have one. Used as a rough guide, never a limit.
      </p>
    </div>
  );
}
