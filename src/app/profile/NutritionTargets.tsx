"use client";

import Slider from "@/components/ui/Slider";
import { SingleChipGroup } from "@/components/ui/ChipGroup";
import { DEFAULT_PROTEIN_TARGET_G, GOALS, PROTEIN_TARGET } from "@/lib/options";
import { ACTIVITY_FACTORS, calculateNutritionTargets, estimateEnergy, GOAL_ENERGY_ADJUSTMENT, PROTEIN_G_PER_KG, suggestProtein } from "@/lib/nutrition";
import { goalOrDefault } from "@/lib/profile";
import type { ProfileFormValues } from "@/lib/types";
import CalorieTargetField from "./CalorieTargetField";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * The body of Me's "Nutrition targets" section (the section frame and the
 * body inputs live in NutritionSection). Calculated estimates plus the
 * user's optional overrides. The calculated
 * numbers are recomputed from the inputs above on every change and are never
 * saved — only a manual value is. "Use suggested" is simply a null override,
 * so a suggestion can never overwrite something the user typed.
 */
export default function NutritionTargets({
  values,
  set,
}: {
  values: ProfileFormValues;
  set: <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void;
}) {
  const goal = goalOrDefault(values.goal);
  const energy = estimateEnergy(values, goal);
  const protein = suggestProtein(values.weight_kg, goal);
  const suggestedKcal = energy?.suggested ?? null;

  const ownCalories = values.daily_calorie_target_kcal !== null;
  const ownProtein = values.protein_target_g !== null;

  const targets = calculateNutritionTargets(values, DEFAULT_PROTEIN_TARGET_G);

  return (
    <div>
      <div className="space-y-5">
        {energy || targets.protein.source !== "fallback" ? <Summary values={values} targets={targets} /> : null}
        {!energy && <p className="text-sm text-muted">{missingMessage(values)}</p>}

        {suggestedKcal ? (
          <div>
            <p className="mb-2 text-sm">Calorie target</p>
            <SingleChipGroup
              options={[
                { value: "suggested", label: "Use suggested" },
                { value: "own", label: "Set my own" },
              ]}
              value={ownCalories ? "own" : "suggested"}
              onChange={(choice) =>
                set("daily_calorie_target_kcal", choice === "suggested" ? null : suggestedKcal.target)
              }
            />
            {ownCalories && (
              <div className="mt-3">
                <CalorieTargetField
                  key="own-calories"
                  value={values.daily_calorie_target_kcal}
                  onChange={(value) => set("daily_calorie_target_kcal", value)}
                />
              </div>
            )}
          </div>
        ) : (
          <CalorieTargetField
            value={values.daily_calorie_target_kcal}
            onChange={(value) => set("daily_calorie_target_kcal", value)}
          />
        )}

        <div>
          {protein ? (
            <>
              <Estimate
                label="Suggested protein"
                value={`~${fmt(protein.target)} g/day (about ${fmt(protein.low)}–${fmt(protein.high)})`}
                note="Based on your weight and goal."
              />
              <div className="mt-3">
                <SingleChipGroup
                  options={[
                    { value: "suggested", label: "Use suggested" },
                    { value: "own", label: "Set my own" },
                  ]}
                  value={ownProtein ? "own" : "suggested"}
                  onChange={(choice) => set("protein_target_g", choice === "suggested" ? null : protein.target)}
                />
              </div>
            </>
          ) : (
            <p className="mb-3 text-xs text-muted">
              Add your weight for a suggested protein target. Until then we use {DEFAULT_PROTEIN_TARGET_G} g/day
              {ownProtein ? ", or the value you set" : ""}.
            </p>
          )}
          {(ownProtein || !protein) && (
            <div className={protein ? "mt-4" : ""}>
              <Slider
                label="Protein target"
                value={values.protein_target_g ?? DEFAULT_PROTEIN_TARGET_G}
                min={PROTEIN_TARGET.min}
                max={PROTEIN_TARGET.max}
                step={PROTEIN_TARGET.step}
                format={(v) => `${v}g / day`}
                onChange={(value) => set("protein_target_g", value)}
              />
            </div>
          )}
        </div>
      </div>
      <p className="mt-5 text-xs text-muted">
        Estimates from a standard equation (Mifflin–St Jeor) — not medical advice, and individual needs vary.
      </p>
    </div>
  );
}

/**
 * "Your nutrition targets": the numbers the app will actually size meals with,
 * from the one calculation (lib/nutrition.ts → calculateNutritionTargets).
 * Daily energy is a goal-adjusted RANGE; BMR appears only under "How this is
 * estimated", as the intermediate step it is — never as something to eat.
 */
function Summary({ values, targets }: { values: ProfileFormValues; targets: ReturnType<typeof calculateNutritionTargets> }) {
  const goalLabel = GOALS.find((g) => g.value === targets.goal)?.label ?? "";
  const calories = targets.calories;
  const adjustment = GOAL_ENERGY_ADJUSTMENT[targets.goal];
  const perKg = PROTEIN_G_PER_KG[targets.goal];
  return (
    <section aria-label="Your nutrition targets" className="rounded-2xl bg-accent-soft/40 p-4">
      <h3 className="text-sm font-semibold">Your nutrition targets</h3>
      <dl className="mt-2 space-y-1.5 text-sm">
        <Row
          label="Estimated daily energy"
          value={
            calories
              ? `~${fmt(calories.low)}–${fmt(calories.high)} kcal`
              : targets.maintenance !== null
                ? `~${fmt(targets.maintenance)} kcal (maintenance)`
                : "Not enough details yet"
          }
        />
        <Row label="Protein" value={`~${fmt(targets.protein.low)}–${fmt(targets.protein.high)} g/day`} />
        {values.goal !== null && <Row label="Goal" value={goalLabel} />}
      </dl>
      <p className="mt-2 text-xs text-muted">
        Estimates, used softly to size the meals we suggest — not a budget to hit, and nothing is tracked.
        {calories?.floorApplied ? " Kept at a gentle minimum — we don't suggest going lower." : ""}
      </p>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-ink/80">How this is estimated</summary>
        <div className="mt-1.5 space-y-1">
          {targets.bmr !== null && targets.maintenance !== null && values.activity_level && (
            <p>
              Resting energy (BMR) ≈ {fmt(targets.bmr)} kcal/day, from the Mifflin–St Jeor equation. It&apos;s what your body uses at rest —{" "}
              <strong>not</strong> an amount to eat. × {ACTIVITY_FACTORS[values.activity_level]} for your activity ≈ {fmt(targets.maintenance)} kcal/day to
              maintain weight.
            </p>
          )}
          {calories?.source === "estimated" && adjustment && (
            <p>
              Goal ({goalLabel}): {adjustment.low > 0 ? "+" : ""}
              {Math.round(adjustment.low * 100)}% to {adjustment.high > 0 ? "+" : ""}
              {Math.round(adjustment.high * 100)}% from maintenance.
            </p>
          )}
          {calories?.source === "manual" && <p>Based on the calorie target you set, ± 5%.</p>}
          {targets.protein.source === "estimated" && (
            <p>
              Protein ≈ {perKg.low}–{perKg.high} g per kg of body weight for this goal.
            </p>
          )}
          {targets.protein.source === "manual" && <p>Based on the protein target you set.</p>}
          {targets.protein.source === "fallback" && <p>Protein uses a general starting point until you add your weight or set your own.</p>}
          <p>Individual needs vary. This isn&apos;t medical advice.</p>
        </div>
      </details>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold text-accent">{value}</dd>
    </div>
  );
}

function Estimate({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm">{label}</span>
        <span className="text-sm font-semibold text-accent">{value}</span>
      </div>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

function missingMessage(v: ProfileFormValues): string {
  const missing = [
    v.age_years === null && "age",
    v.sex === null && "sex",
    v.height_cm === null && "height",
    v.weight_kg === null && "weight",
    v.activity_level === null && "activity level",
  ].filter((m): m is string => typeof m === "string");
  if (missing.length === 0) return "Some of your details are outside the range we can estimate for.";
  return `Add your ${missing.join(", ")} above to see estimates.`;
}
