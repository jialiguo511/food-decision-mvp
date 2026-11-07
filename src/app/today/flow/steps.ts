// Which questions Home asks, in order, for the answers so far. One question
// per screen (CLAUDE.md → "Minimum decisions, progressive disclosure"); a
// question that doesn't apply to the current answers is simply not in the
// list, so it can never appear. Pure — the screens render whatever this says.

import { asksTravel } from "@/lib/places/travel";
import type { CookForm, DecisionMode, MealContext, OrderContext, StoreSnackContext } from "@/lib/types";

/** Any mode's answers as the form holds them. */
export type AnyForm = CookForm | OrderContext | StoreSnackContext;

export type CookStep = "hunger" | "time_effort" | "shopping" | "budget" | "ingredients" | "craving";
export type OrderStep = "method" | "hunger" | "craving" | "budget" | "travel";
export type SnackStep = "hunger" | "craving";
export type Step = CookStep | OrderStep | SnackStep;

/** "Use what I have" needs today's foods (nothing else is available to it);
 *  "I can buy a few things" asks the budget instead, with today's foods one
 *  tap away on that same screen. Until shopping is answered the budget branch
 *  stands in (it only fixes the number of steps, not what is asked). */
export function cookSteps(values: Pick<MealContext, "shopping"> | Pick<CookForm, "shopping">): CookStep[] {
  return ["hunger", "time_effort", "shopping", values.shopping === "can_buy" ? "budget" : "ingredients", "craving"];
}

/** How far would you go? — Pickup and Eat nearby only (see travel.ts). */
export function orderSteps(values: OrderContext): OrderStep[] {
  return ["method", "hunger", "craving", "budget", ...(asksTravel(values.method) ? (["travel"] as const) : [])];
}

export function snackSteps(): SnackStep[] {
  return ["hunger", "craving"];
}

export function stepsFor(values: AnyForm): Step[] {
  if (values.decision_mode === "cook") return cookSteps(values);
  if (values.decision_mode === "order") return orderSteps(values);
  return snackSteps();
}

/** Whether an Eat out request goes to real nearby places (Pickup / Eat
 *  nearby) or to food ideas by type (Delivery). */
export function searchesNearby(values: OrderContext): boolean {
  return asksTravel(values.method);
}

// ---------------------------------------------------------------------------
// When does an answer move on by itself? ONE rule, for every question in Cook,
// Get food and Snack — decided by what KIND of input the screen is, and nothing
// else (not its position, not which mode it's in):
//
//   single    A pure single choice — one group, nothing else to fill in.
//             A tap AUTO-ADVANCES, after a beat so the choice visibly registers.
//             On the last question "advancing" is sending the request.
//   multi     Several selections (foods on hand).            → explicit Continue
//   text      Typed or custom text (a craving note).         → explicit Continue
//   slider    A slider or number.                            → explicit Continue
//   reveals   A choice that shows more controls (Cook's
//             budget → "Different tonight", "Add foods").    → explicit Continue
//   composite Several controls on one screen (Time + Cooking).→ explicit Continue
//
// Every screen also keeps its Continue / final button, so a preselected answer
// can be accepted without tapping it again. This table is the only place that
// decides — the question screens just render and report the answer. A new
// question is added HERE with its kind, nowhere else; never make a screen
// advance by calling `onNext` from its own handler. Back returns to the exact
// previous question with its answer still selected (answers live in the form
// state, not the screen).
// ---------------------------------------------------------------------------
export type StepKind = "single" | "multi" | "text" | "slider" | "reveals" | "composite";

export const STEP_KINDS = {
  cook: {
    hunger: "single",
    time_effort: "composite",
    shopping: "single",
    budget: "reveals",
    ingredients: "multi",
    craving: "text",
  },
  order: {
    method: "single",
    hunger: "single",
    craving: "text",
    budget: "single",
    travel: "single",
  },
  store_snack: {
    hunger: "single",
    craving: "single",
  },
} as const satisfies Record<DecisionMode, Record<string, StepKind>>;

export function stepKind(mode: DecisionMode, step: Step): StepKind {
  const kinds: Record<string, StepKind> = STEP_KINDS[mode];
  return kinds[step] ?? "composite"; // an unlisted step waits for Continue
}

/** Whether a tap on this question's answer moves on by itself. */
export function autoAdvances(mode: DecisionMode, step: Step): boolean {
  return stepKind(mode, step) === "single";
}

/** Where the "What do you have right now?" question sits for these answers —
 *  used to take a restored "Use what I have" straight to it. */
export function ingredientsStepIndex(values: Pick<CookForm, "shopping">): number {
  return cookSteps({ ...values, shopping: "inventory_only" }).indexOf("ingredients");
}
