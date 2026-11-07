"use client";

import { useState } from "react";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { ACTIVITY_LEVELS, SEXES } from "@/lib/options";
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, round1 } from "@/lib/nutrition";
import type { ActivityLevel, ProfileFormValues, Sex } from "@/lib/types";

type Units = "us" | "metric";

/** The optional body inputs behind the nutrition estimates — shared by Me's
 *  Nutrition targets and the post-results nutrition step, so both store the
 *  same units the same way. Stored in centimeters and kilograms only; US units
 *  (the default) are a display convenience, converted on every edit, so the two
 *  never drift apart. */
export function AboutYouFields({
  values,
  set,
}: {
  values: ProfileFormValues;
  set: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void;
}) {
  const [units, setUnits] = useState<Units>("us");

  return (
    <>
      <NumberField
        label="Age"
        unit="years"
        width="w-20"
        maxLength={3}
        value={values.age_years}
        toDraft={(v) => String(v)}
        fromDraft={(draft) => (draft === "" ? null : Number(draft))}
        onChange={(v) => set("age_years", v)}
      />

      <div>
        <p className="mb-2 text-sm">Sex used for the calculation</p>
        <SingleChipGroup
          options={SEXES}
          // "" matches no chip, so unset shows nothing selected.
          value={values.sex ?? ""}
          onChange={(value) => set("sex", value as Sex)}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm">Units</span>
        <SingleChipGroup
          options={[
            { value: "us", label: "ft / lb" },
            { value: "metric", label: "cm / kg" },
          ]}
          value={units}
          onChange={(value) => setUnits(value as Units)}
        />
      </div>

      {units === "us" ? (
        <>
          <HeightUs key="h-us" cm={values.height_cm} onChange={(cm) => set("height_cm", cm)} />
          <NumberField
            key="w-us"
            label="Weight"
            unit="lb"
            width="w-24"
            maxLength={5}
            decimal
            value={values.weight_kg}
            toDraft={(kg) => String(Math.round(kgToLb(kg)))}
            fromDraft={(draft) => (draft === "" ? null : round1(lbToKg(Number(draft))))}
            onChange={(kg) => set("weight_kg", kg)}
          />
        </>
      ) : (
        <>
          <NumberField
            key="h-m"
            label="Height"
            unit="cm"
            width="w-24"
            maxLength={5}
            decimal
            value={values.height_cm}
            toDraft={(cm) => String(round1(cm))}
            fromDraft={(draft) => (draft === "" ? null : round1(Number(draft)))}
            onChange={(cm) => set("height_cm", cm)}
          />
          <NumberField
            key="w-m"
            label="Weight"
            unit="kg"
            width="w-24"
            maxLength={5}
            decimal
            value={values.weight_kg}
            toDraft={(kg) => String(round1(kg))}
            fromDraft={(draft) => (draft === "" ? null : round1(Number(draft)))}
            onChange={(kg) => set("weight_kg", kg)}
          />
        </>
      )}

      <div>
        <p className="mb-2 text-sm">Activity level</p>
        <SingleChipGroup
          options={ACTIVITY_LEVELS}
          value={values.activity_level ?? ""}
          onChange={(value) => set("activity_level", value as ActivityLevel)}
        />
      </div>
    </>
  );
}

/** A typed number with its own draft text, so half-typed input ("17.") isn't
 *  clobbered by a round-trip through the stored value. Remount (via `key`) to
 *  re-read the stored value, e.g. after switching units. */
function NumberField({
  label,
  unit,
  width,
  maxLength,
  decimal = false,
  value,
  toDraft,
  fromDraft,
  onChange,
}: {
  label: string;
  unit: string;
  width: string;
  maxLength: number;
  decimal?: boolean;
  value: number | null;
  toDraft: (value: number) => string;
  fromDraft: (draft: string) => number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value === null ? "" : toDraft(value));
  const id = `profile-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          value={draft}
          onChange={(event) => {
            const cleaned = decimal
              ? event.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")
              : event.target.value.replace(/\D/g, "");
            const next = cleaned.slice(0, maxLength);
            setDraft(next);
            const parsed = fromDraft(next);
            onChange(parsed !== null && Number.isFinite(parsed) ? parsed : null);
          }}
          className={`${width} rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent`}
        />
        <span className="text-sm text-muted">{unit}</span>
      </div>
    </div>
  );
}

function HeightUs({ cm, onChange }: { cm: number | null; onChange: (cm: number | null) => void }) {
  const initial = cm === null ? null : cmToFeetInches(cm);
  const [feet, setFeet] = useState(initial ? String(initial.feet) : "");
  const [inches, setInches] = useState(initial ? String(initial.inches) : "");

  function update(nextFeet: string, nextInches: string) {
    setFeet(nextFeet);
    setInches(nextInches);
    onChange(nextFeet === "" ? null : round1(feetInchesToCm(Number(nextFeet), Number(nextInches || 0))));
  }
  const box = "w-16 rounded-xl border border-line bg-card px-3 py-2 outline-none focus:border-accent";
  return (
    <div>
      <p className="mb-2 text-sm">Height</p>
      <div className="flex items-center gap-2">
        <input
          aria-label="Height, feet"
          inputMode="numeric"
          autoComplete="off"
          value={feet}
          onChange={(e) => update(e.target.value.replace(/\D/g, "").slice(0, 1), inches)}
          className={box}
        />
        <span className="text-sm text-muted">ft</span>
        <input
          aria-label="Height, inches"
          inputMode="numeric"
          autoComplete="off"
          value={inches}
          onChange={(e) => update(feet, e.target.value.replace(/\D/g, "").slice(0, 2))}
          className={box}
        />
        <span className="text-sm text-muted">in</span>
      </div>
    </div>
  );
}
