"use client";

import { useState } from "react";
import { calculateNutritionTargets } from "@/lib/nutrition";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import type { ProfileFormValues } from "@/lib/types";
import { AboutYouFields } from "./AboutYouFields";
import NutritionTargets from "./NutritionTargets";

type SetField = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => void;

const fmt = (n: number) => n.toLocaleString("en-US");

/** One line for the collapsed header: the ranges meals are sized from, or "Not set". */
export function nutritionStatus(v: ProfileFormValues): string {
  const t = calculateNutritionTargets(v, DEFAULT_PROTEIN_TARGET_G);
  if (!t.personalized) return "Not set";
  const parts = [
    t.calories ? `~${fmt(t.calories.low)}–${fmt(t.calories.high)} kcal` : null,
    t.protein.source !== "fallback" ? `~${fmt(t.protein.low)}–${fmt(t.protein.high)} g protein` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "Not set";
}

/**
 * Optional, collapsed by default: age, sex, height, weight and activity exist
 * only to estimate portions and protein, so they sit behind a tap instead of
 * leading the page. Nothing here is needed to get suggestions.
 */
export default function NutritionSection({ values, set }: { values: ProfileFormValues; set: SetField }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-line bg-card shadow-[0_1px_2px_rgba(42,37,32,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 p-5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold tracking-tight">Nutrition targets</span>
          <span className="block text-sm text-muted">Optional · helps estimate portions and protein</span>
          {!open && <span className="mt-1 block text-sm font-medium text-accent">{nutritionStatus(values)}</span>}
        </span>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="animate-fade-in space-y-6 border-t border-line p-5">
          <p className="text-xs text-muted">Only used to estimate calories and protein — never shared, never inferred.</p>
          <div className="space-y-5">
            <AboutYouFields values={values} set={set} />
          </div>
          <NutritionTargets values={values} set={set} />
        </div>
      )}
    </section>
  );
}
