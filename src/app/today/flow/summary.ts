// The one-line "Use my usual" summary, e.g. "Starving · Eat nearby · Nearby ·
// $15–25". Built from the same option labels the questions use, so the
// summary and the chips can't drift apart. Only answers that change the
// request appear; "no preference" answers are left out rather than spelled out.

import {
  MEAL_BUDGETS,
  ORDER_METHODS,
  STORE_SNACK_CRAVINGS,
  TRAVEL_OPTIONS,
} from "@/lib/options";
import { asksTravel } from "@/lib/places/travel";
import type { DecisionContext, Effort, Hunger, OpenContext } from "@/lib/types";
import type { AnyForm } from "./steps";

export const label = <T extends string>(list: { value: T; label: string }[], value: T) =>
  list.find((o) => o.value === value)?.label ?? null;

/** The answers a summary can name. Each part says which field it came from, so
 *  the sentence entry can show what the user SAID apart from what was filled in
 *  from their history. */
export type SummaryField = "hunger" | "time" | "effort" | "shopping" | "budget" | "method" | "distance" | "meal_budget" | "craving_type";

export type SummaryPart = { field: SummaryField; text: string };

export function summaryParts(values: AnyForm): SummaryPart[] {
  const part = (field: SummaryField, text: string | null): SummaryPart | null => (text === null ? null : { field, text });
  const parts: (SummaryPart | null)[] = [part("hunger", HUNGER_PHRASES[values.hunger])];
  if (values.decision_mode === "cook") {
    // Only answers that exist: a summary says what is being assumed, so an
    // unanswered one is left out rather than filled in.
    parts.push(
      part("time", values.cook_minutes === null ? null : `${values.cook_minutes} min`),
      part("effort", values.effort === null ? null : EFFORT_PHRASES[values.effort]),
    );
    if (values.shopping === "inventory_only") parts.push(part("shopping", "Use what I have"));
    else if (values.shopping === "can_buy") {
      parts.push(
        values.budget_override_usd === null ? part("shopping", "Can buy a few things") : part("budget", `~$${values.budget_override_usd} to spend`),
      );
    }
  } else if (values.decision_mode === "order") {
    parts.push(part("method", label(ORDER_METHODS, values.method)));
    if (asksTravel(values.method) && values.travel_willingness !== "no_preference") {
      parts.push(part("distance", label(TRAVEL_OPTIONS, values.travel_willingness)));
    }
    if (values.meal_budget !== "no_preference") parts.push(part("meal_budget", label(MEAL_BUDGETS, values.meal_budget)));
  } else if (values.craving_type !== "anything") {
    parts.push(part("craving_type", label(STORE_SNACK_CRAVINGS, values.craving_type)));
  }
  return parts.filter((p): p is SummaryPart => p !== null);
}

export function contextSummary(values: AnyForm): string[] {
  return summaryParts(values).map((p) => p.text);
}

/** The same one-liner for ANY request on screen, including a cross-way one. */
export function sessionSummary(context: DecisionContext): string[] {
  return context.decision_mode === "open" ? openSummary(context) : contextSummary(context);
}

function openSummary(c: OpenContext): string[] {
  const parts: (string | null)[] = [
    HUNGER_PHRASES[c.hunger],
    c.ways.cook ? "Cook or buy" : "Buying, not cooking",
    c.minutes === null ? null : `${c.minutes} min`,
    c.effort === null ? null : EFFORT_PHRASES[c.effort],
    c.extra_spend_usd === null ? null : `~$${c.extra_spend_usd} to spend`,
    c.meal_budget === "no_preference" ? null : label(MEAL_BUDGETS, c.meal_budget),
    c.after_exercise ? "After exercise" : null,
    c.protein_focus ? "Wants protein" : null,
    c.easy_pick ? "Easy options" : null,
  ];
  return parts.filter((p): p is string => p !== null);
}

/** Hunger and effort as phrases — the bare chip labels ("Normal", "None", "A
 *  little") don't read on their own in a summary line. */
export const HUNGER_PHRASES: Record<Hunger, string> = {
  light: "Something light",
  normal: "Normal hunger",
  very_hungry: "Starving",
};

export const EFFORT_PHRASES: Record<Effort, string> = {
  minimal: "Barely cook",
  some: "A little effort",
  happy_to_cook: "Happy to cook",
};


/** What the primary button says, by what it will do — never a generic "Find
 *  something". Pickup and Eat nearby both search real places. */
export function ctaLabel(values: AnyForm): string {
  if (values.decision_mode === "cook") return "Show me meals";
  if (values.decision_mode === "store_snack") return "Find me a snack";
  return asksTravel(values.method) ? "Find food nearby" : "Find something to order";
}

/**
 * The short list shown while a request runs: what is being taken into account,
 * in the user's own terms. Only things that are true of this request — the
 * "foods you avoid" line appears only when the Profile has some, and only the
 * limits that actually apply are named.
 */
export function loadingLines(values: DecisionContext, { avoidsFoods }: { avoidsFoods: boolean }): string[] {
  const lines: string[] = [];
  if (values.decision_mode === "open") {
    lines.push(values.ways.cook ? "Weighing cooking against getting food" : "Looking at things to buy");
    if (values.easy_pick) lines.push("Keeping it easy");
  } else if (values.decision_mode === "cook") {
    lines.push(values.shopping === "inventory_only" ? "Using what you have" : "Allowing a few things to buy");
    lines.push(`Keeping prep under ${values.cook_minutes} min`);
  } else if (values.decision_mode === "order") {
    if (asksTravel(values.method)) {
      lines.push("Looking at what's open near you");
      if (values.travel_willingness !== "no_preference") lines.push(`Staying ${label(TRAVEL_OPTIONS, values.travel_willingness)?.toLowerCase()}`);
    } else {
      lines.push("Picking food that's easy to order");
    }
    if (values.meal_budget !== "no_preference") lines.push(`Around ${label(MEAL_BUDGETS, values.meal_budget)}`);
  } else {
    lines.push("Looking for something quick to grab");
  }
  if (avoidsFoods) lines.push("Leaving out foods you avoid");
  // Three reasons at most, then the one that always applies.
  return [...lines.slice(0, 3), "Narrowing it down to 3"];
}
