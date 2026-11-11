"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import OptionalChoice from "@/components/ui/OptionalChoice";
import { MultiChipGroup } from "@/components/ui/ChipGroup";
import {
  COMMON_ALLERGIES,
  COMMON_DISLIKES,
  COOK_MINUTES,
  CUISINES,
  EXTRAS_BUDGET_PRESETS,
  FRIDGE_SIZES,
  GOALS,
} from "@/lib/options";
import type { FridgeSize, Goal, ProfileFormValues } from "@/lib/types";
import { ALLERGY_NOTE } from "@/lib/disclaimers";
import { saveProfile } from "./actions";
import DietaryPicker from "./DietaryPicker";
import EquipmentPicker from "./EquipmentPicker";
import type { AllergyStatus } from "@/lib/allergyStatus";
import { confirmNoAllergies } from "../today/actions";
import FoodTermsCard from "./FoodTermsCard";
import HealthPrioritiesCard from "./HealthPrioritiesCard";
import NutritionSection from "./NutritionSection";
import ProfileSection from "./ProfileSection";

/** `staples` is Kitchen staples, which saves itself as you edit it (unlike the
 *  rest, which waits for "Save profile"), so it arrives as a slot. */
export default function ProfileForm({ initial, staples, allergyStatus }: { initial: ProfileFormValues; staples: React.ReactNode; allergyStatus: AllergyStatus }) {
  const [values, setValues] = useState<ProfileFormValues>(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<null | { ok: boolean; message: string }>(null);
  // "Not set" and "no known allergies" are different answers (lib/allergyStatus.ts).
  const [allergiesAnswered, setAllergiesAnswered] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const allergiesUnset = allergyStatus === "not_set" && !allergiesAnswered && values.allergies.length === 0;

  async function confirmNone() {
    setConfirming(true);
    const result = await confirmNoAllergies();
    setConfirming(false);
    if (result.ok) setAllergiesAnswered(true);
    else setStatus({ ok: false, message: result.error });
  }

  // One helper instead of a dozen onChange handlers.
  function set<K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setStatus(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await saveProfile(values);
      setStatus(
        result.ok
          ? { ok: true, message: "Saved" }
          : { ok: false, message: result.error },
      );
    });
  }

  // A nudge only — we never move a dislike into Allergies ourselves. Before
  // Profile v2 "Foods to avoid" was a hard list, so some users may have put an
  // allergen there.
  const allergenLikeDislikes = values.dislikes.filter((d) =>
    COMMON_ALLERGIES.some((a) => a.toLowerCase() === d.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <ProfileSection title="Food preferences" caption="Always used in your suggestions">
        <FoodTermsCard
          title="Allergies"
          hint={`We leave these out of suggestions. ${ALLERGY_NOTE}`}
          common={COMMON_ALLERGIES}
          values={values.allergies}
          placeholder="Another allergy…"
          onChange={(next) => set("allergies", next)}
          notice={
            allergiesUnset
              ? "Not set yet — we're not assuming you have none."
              : values.allergies.length === 0
                ? "No known allergies."
                : null
          }
        />
        {allergiesUnset && (
          <button
            type="button"
            onClick={confirmNone}
            disabled={confirming}
            className="-mt-4 min-h-11 text-left text-sm font-semibold text-accent disabled:opacity-50"
          >
            {confirming ? "Saving…" : "I have no known food allergies"}
          </button>
        )}

        <Card title="Dietary preferences" hint="Treated like allergies: we won't suggest anything that breaks them. We can't verify sourcing, so always check yourself.">
          <DietaryPicker patterns={values.dietary_patterns} other={values.dietary_other} set={set} />
        </Card>

        <FoodTermsCard
          title="Foods I don't eat"
          hint="A preference, not a safety rule — we'll steer away from these."
          common={COMMON_DISLIKES}
          values={values.dislikes}
          placeholder="Something else…"
          notice={allergenLikeDislikes.length > 0 ? `${allergenLikeDislikes.join(", ")} is listed here as a dislike. If it's an allergy, add it under Allergies — dislikes are only a preference.` : null}
          onChange={(next) => set("dislikes", next)}
        />

        <Card title="Cuisines I like" hint="Pick as many as you want.">
          <MultiChipGroup options={CUISINES} values={values.cuisines} onChange={(next) => set("cuisines", next)} />
        </Card>

        <HealthPrioritiesCard values={values} set={set} />
      </ProfileSection>

      <ProfileSection title="My goals" caption="Helps shape suggestions, and any calorie or protein estimates">
        <Card>
          <OptionalChoice options={GOALS} value={values.goal} onChange={(value) => set("goal", value as Goal | null)} />
        </Card>
      </ProfileSection>

      <NutritionSection values={values} set={set} />

      <ProfileSection title="Kitchen basics" caption="Used when you make something">
        {staples}

        <Card
          title="What I can cook with"
          hint="We only suggest meals you can actually make. Until you answer, we assume no appliance at all."
        >
          <EquipmentPicker values={values.equipment ?? []} onChange={(next) => set("equipment", next.length > 0 ? next : null)} />
          {values.equipment === null && <p className="mt-2 text-xs text-muted">Not set</p>}
        </Card>

        <Card title="Fridge size">
          <OptionalChoice options={FRIDGE_SIZES} value={values.fridge_size} onChange={(value) => set("fridge_size", value as FridgeSize | null)} />
        </Card>

        <Card title="Usual time to cook" hint="Your starting point when you cook — you can change it any time.">
          <OptionalChoice
            options={COOK_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
            value={values.default_cook_minutes === null ? null : String(values.default_cook_minutes)}
            onChange={(value) => set("default_cook_minutes", value === null ? null : Number(value))}
          />
        </Card>

        <Card title="Usual budget" hint="The most you'd spend on missing ingredients for one meal. Your starting point when you cook — you can change it any time.">
          <OptionalChoice
            options={budgetOptions(values.budget_per_meal_usd)}
            value={values.budget_per_meal_usd === null ? null : String(values.budget_per_meal_usd)}
            onChange={(value) => set("budget_per_meal_usd", value === null ? null : Number(value))}
          />
        </Card>
      </ProfileSection>

      {/* Normal document flow, never sticky/fixed: a floating bar sat on top of
          the cards below it (same rule as Home's buttons). */}
      <div className="pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/20 transition-opacity disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {status && (
          <p
            role="status"
            className={`mt-2 text-center text-sm ${
              status.ok ? "text-accent" : "text-red-600"
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

/** The preset budgets, plus the stored value when it isn't one of them (e.g. a
 *  number set before these presets existed), so it still shows as selected. */
function budgetOptions(current: number | null) {
  const values = new Set<number>(EXTRAS_BUDGET_PRESETS);
  if (current !== null) values.add(current);
  return [...values].sort((a, b) => a - b).map((n) => ({ value: String(n), label: `$${n}` }));
}
