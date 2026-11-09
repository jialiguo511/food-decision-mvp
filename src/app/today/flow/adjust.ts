// "Adjust" — change the recommendation on screen without starting over. Pure: no network, no React.
//
// The idea, in one line: the request on screen is turned back into the same record a sentence is read
// into (an `Interpretation`), what the person now says is laid over it, and the result goes through the
// SAME `applyInterpretation` a first sentence does. So there is no second set of rules:
//
//   • what was not changed stays (it is in the base record);
//   • what the new words say replaces what conflicts with it — including the WAY (cook / get food /
//     snack / open): a new way never inherits the old one;
//   • HOW they get food (ways) and WHAT KIND of eating (meal vs snack) are separate: cooking is not "a
//     meal", and a meal is not "cooking";
//   • a condition they dropped ("no time limit") is dropped and is not refilled from a remembered default;
//   • answers that don't apply to the new way (a cooking time for a snack) simply aren't used, and what
//     still means something (hunger, craving, foods, exercise) carries over;
//   • hard constraints are not here at all — the server applies the Profile's to every request.
//
// What it never does: write the Profile, invent a value the person didn't give, or ask the whole
// questionnaire again — `needs_answers` lists only what the new way truly cannot go without.

import type { Interpretation } from "@/lib/interpret/schema";
import { parseInterpretation, type AdjustingWay, type Clearable } from "@/lib/interpret/schema";
import type { DecisionContext, DecisionMode } from "@/lib/types";
import { applyInterpretation, type Applied } from "./interpret";
import type { FormValues } from "./QuestionFlow";

/** The request on screen, as the record a sentence would have produced for it. */
export function interpretationOf(context: DecisionContext): Interpretation {
  const blank = parseInterpretation({});
  if (context.decision_mode === "cook") {
    return {
      ...blank,
      mode: "cook",
      hunger: context.hunger,
      minutes: context.cook_minutes,
      effort: context.effort,
      shopping: context.shopping,
      foods: context.ingredients_on_hand,
      extra_spend_usd: context.shopping === "can_buy" ? context.budget_override_usd : null,
      craving: context.craving,
    };
  }
  if (context.decision_mode === "order") {
    return {
      ...blank,
      mode: "order",
      hunger: context.hunger,
      method: context.method,
      distance: context.travel_willingness,
      meal_budget: context.meal_budget,
      craving: context.craving_note,
      craving_category: context.craving_category,
    };
  }
  if (context.decision_mode === "store_snack") {
    return { ...blank, mode: "store_snack", hunger: context.hunger, snack_craving: context.craving_type, meal_type: "snack" };
  }
  return {
    ...blank,
    hunger: context.hunger,
    ways: context.ways.cook ? ["cook", "buy"] : ["buy"],
    minutes: context.minutes,
    effort: context.effort,
    extra_spend_usd: context.extra_spend_usd,
    meal_budget: context.meal_budget === "no_preference" ? null : context.meal_budget,
    foods: context.ingredients_on_hand,
    craving: context.craving,
    after_exercise: context.after_exercise ? true : null,
    protein_focus: context.protein_focus ? true : null,
    leave_to_us: context.easy_pick ? true : null,
    meal_type: context.meal_only ? "meal" : null,
  };
}

/** Which way of asking the request is in — all the reader is told about it. */
export const wayOf = (context: DecisionContext): AdjustingWay => context.decision_mode;

/** The base, with what was just said laid over it. */
export function mergeAdjustment(base: Interpretation, delta: Interpretation): Interpretation {
  // A new way of eating (a mode, which ways are fine, a kind of eating, "you decide") REPLACES the old
  // one. Nothing about the way is inherited from the base when the person has just changed it.
  const changesWay = delta.mode !== null || delta.ways.length > 0 || delta.meal_type !== null || delta.leave_to_us === true;
  const leavesSnack = delta.mode === "cook" || delta.mode === "order" || delta.ways.includes("cook") || delta.leave_to_us === true;

  let mode = base.mode;
  let ways = base.ways;
  let leave = base.leave_to_us;
  let mealType = base.meal_type;
  if (changesWay) {
    mode = delta.mode;
    ways = delta.ways;
    leave = delta.leave_to_us;
    mealType = delta.mode === "store_snack" ? "snack" : (delta.meal_type ?? (base.meal_type === "snack" && leavesSnack ? null : base.meal_type));
  }

  const dropped = new Set<Clearable>(delta.clear);
  const keep = <T>(field: Clearable, value: T, empty: T): T => (dropped.has(field) ? empty : value);

  // "How much I'd spend" implies whether they'd shop, the same as in a first sentence.
  const shopping = delta.shopping ?? (delta.extra_spend_usd !== null ? (delta.extra_spend_usd > 0 ? "can_buy" : "inventory_only") : base.shopping);

  return {
    ...base,
    mode,
    ways,
    leave_to_us: leave,
    meal_type: mealType,
    hunger: delta.hunger ?? base.hunger,
    minutes: delta.minutes ?? keep("minutes", base.minutes, null),
    effort: delta.effort ?? keep("effort", base.effort, null),
    shopping,
    // Foods they add are added; saying they no longer have them clears the list first.
    foods: [...new Set([...keep("foods", base.foods, []), ...delta.foods])],
    extra_spend_usd: delta.extra_spend_usd ?? keep("budget", base.extra_spend_usd, null),
    meal_budget: delta.meal_budget ?? keep("budget", base.meal_budget, null),
    method: delta.method ?? base.method,
    distance: delta.distance ?? keep("distance", base.distance, null),
    craving: delta.craving ?? keep("craving", base.craving, null),
    craving_category: delta.craving_category ?? keep("craving", base.craving_category, null),
    snack_craving: delta.snack_craving ?? keep("craving", base.snack_craving, null),
    after_exercise: delta.after_exercise ?? base.after_exercise,
    protein_focus: delta.protein_focus ?? base.protein_focus,
    // Carried so the apply step does not refill a dropped condition from a remembered answer.
    clear: delta.clear,
  };
}

export type Adjusted =
  | { kind: "unchanged" }
  | { kind: "applied"; applied: Applied; /** The base with the change laid over it — what `applyInterpretation` was given. */ merged: Interpretation; /** The mode changed, or the request became/stopped being open. */ switched: boolean };

/**
 * The person's change, applied to the request on screen. `unchanged` when the words do not alter
 * anything that request uses (a budget for a snack, say) — then nothing is sent and the person is told.
 */
export function adjustRequest(current: DecisionContext, delta: Interpretation, forms: FormValues, remembered: Record<DecisionMode, boolean>): Adjusted {
  const base = interpretationOf(current);
  const merged = mergeAdjustment(base, delta);
  const before = applyInterpretation(base, forms, remembered);
  const after = applyInterpretation(merged, forms, remembered);
  const modeOf = (a: Applied) => (a.status === "open" ? "open" : a.mode);
  const switched = modeOf(before) !== modeOf(after);
  const same = !switched && fingerprint(before) === fingerprint(after);
  return same ? { kind: "unchanged" } : { kind: "applied", applied: after, merged, switched };
}

/** What a request would be sent as, for comparison. Stable: the forms are built by the same spreads. */
function fingerprint(a: Applied): string {
  return a.status === "open" ? JSON.stringify(a.context) : JSON.stringify(a.forms[a.mode]);
}

/** The three one-tap changes. Each is a fixed delta — no model, no usage, no text. */
export type QuickAdjust = "cook" | "order" | "snack";
export const QUICK_ADJUSTS: { kind: QuickAdjust; label: string; way: AdjustingWay }[] = [
  { kind: "cook", label: "I'll cook it", way: "cook" },
  { kind: "order", label: "Get food instead", way: "order" },
  { kind: "snack", label: "Just a snack", way: "store_snack" },
];

export function quickDelta(kind: QuickAdjust): Interpretation {
  const blank = parseInterpretation({});
  if (kind === "cook") return { ...blank, mode: "cook", ways: ["cook"] };
  if (kind === "order") return { ...blank, mode: "order" };
  return { ...blank, mode: "store_snack", meal_type: "snack" };
}

/** Every field a summary chip can show — for a changed request the person has said all of them. */
export const ALL_SAID = ["hunger", "time", "effort", "shopping", "budget", "method", "distance", "meal_budget", "craving_type", "foods", "craving", "ways", "exercise", "protein", "meal"] as const;
