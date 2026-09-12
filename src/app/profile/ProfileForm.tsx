"use client";

import { useState, useTransition } from "react";
import Card from "@/components/ui/Card";
import Slider from "@/components/ui/Slider";
import TagInput from "@/components/ui/TagInput";
import { MultiChipGroup, SingleChipGroup } from "@/components/ui/ChipGroup";
import {
  BUDGET_PER_MEAL,
  COMMON_DISLIKES,
  COOK_MINUTES,
  CUISINES,
  EQUIPMENT,
  FRIDGE_SIZES,
  GOALS,
  PROTEIN_TARGET,
} from "@/lib/options";
import type { FridgeSize, Goal, ProfileInput } from "@/lib/types";
import { saveProfile } from "./actions";

export default function ProfileForm({ initial }: { initial: ProfileInput }) {
  const [values, setValues] = useState<ProfileInput>(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<null | { ok: boolean; message: string }>(null);

  // One helper instead of a dozen onChange handlers.
  function set<K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) {
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

  return (
    <div className="space-y-4">
      <Card title="What are you going for?">
        <SingleChipGroup
          options={GOALS}
          value={values.goal}
          onChange={(value) => set("goal", value as Goal)}
        />
      </Card>

      <Card title="Daily targets" hint="Rough numbers are fine — these are estimates.">
        <div className="space-y-5">
          <Slider
            label="Protein target"
            value={values.protein_target_g}
            min={PROTEIN_TARGET.min}
            max={PROTEIN_TARGET.max}
            step={PROTEIN_TARGET.step}
            format={(v) => `${v}g / day`}
            onChange={(value) => set("protein_target_g", value)}
          />
          <Slider
            label="Normal budget per meal"
            value={values.budget_per_meal_usd}
            min={BUDGET_PER_MEAL.min}
            max={BUDGET_PER_MEAL.max}
            step={BUDGET_PER_MEAL.step}
            format={(v) => `$${v}`}
            onChange={(value) => set("budget_per_meal_usd", value)}
          />
        </div>
      </Card>

      <Card title="Cuisines you actually like" hint="Pick as many as you want.">
        <MultiChipGroup
          options={CUISINES}
          values={values.cuisines}
          onChange={(next) => set("cuisines", next)}
        />
      </Card>

      <Card title="Foods to avoid" hint="We will never suggest these.">
        <MultiChipGroup
          options={COMMON_DISLIKES}
          values={values.dislikes.filter((d) =>
            (COMMON_DISLIKES as readonly string[]).includes(d),
          )}
          onChange={(picked) => {
            const custom = values.dislikes.filter(
              (d) => !(COMMON_DISLIKES as readonly string[]).includes(d),
            );
            set("dislikes", [...picked, ...custom]);
          }}
        />
        <div className="mt-3">
          <TagInput
            placeholder="Something else…"
            values={values.dislikes.filter(
              (d) => !(COMMON_DISLIKES as readonly string[]).includes(d),
            )}
            onChange={(custom) => {
              const picked = values.dislikes.filter((d) =>
                (COMMON_DISLIKES as readonly string[]).includes(d),
              );
              set("dislikes", [...picked, ...custom]);
            }}
          />
        </div>
      </Card>

      <Card title="Your kitchen" hint="We only suggest meals you can actually make.">
        <MultiChipGroup
          options={EQUIPMENT}
          values={values.equipment}
          onChange={(next) => set("equipment", next)}
        />
        <div className="mt-5">
          <p className="mb-2 text-sm">Fridge size</p>
          <SingleChipGroup
            options={FRIDGE_SIZES}
            value={values.fridge_size}
            onChange={(value) => set("fridge_size", value as FridgeSize)}
          />
        </div>
      </Card>

      <Card title="Usual time to cook" hint="You can override this any day on Today.">
        <SingleChipGroup
          options={COOK_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))}
          value={String(values.default_cook_minutes)}
          onChange={(value) => set("default_cook_minutes", Number(value))}
        />
      </Card>

      {/* Sticky save bar so the button is always reachable on a phone. */}
      <div className="sticky bottom-24 pt-2">
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
