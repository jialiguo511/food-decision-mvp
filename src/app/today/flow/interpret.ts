// Merging a read sentence into Home's answers. Pure — no network, no React.
//
// Three kinds of value, never confused:
//   said      the person clearly said it (the Interpretation has it);
//   assumed   not said, but a REAL earlier answer or Profile default supplies it
//             (that is what the forms already hold — see rememberedDefaults.ts);
//   missing   neither. Only what a request truly cannot go without is asked
//             for; everything else is left out rather than invented.
//
// What the sentence never does: write to the Profile, add a food the person
// did not name, fill a budget / equipment / place they did not give, or touch
// a hard constraint (the recommender applies allergies and the dietary pattern
// to every request, whatever way it was entered). A value the person said
// beats a remembered one, the same way a tap in the question flow would.

import { missingCookAnswers, toMealContext } from "@/lib/recommend/cookForm";
import { asksTravel } from "@/lib/places/travel";
import type { Interpretation } from "@/lib/interpret/schema";
import type { CookForm, DecisionMode, OrderContext, StoreSnackContext } from "@/lib/types";
import type { FormValues } from "./QuestionFlow";
import { summaryParts, type SummaryField } from "./summary";

export type Said = SummaryField | "foods" | "craving";

/** What a request is still missing — the only things worth asking. */
export type ClarifyStep = "time_effort" | "shopping" | "budget" | "ingredients" | "method";

export type Applied =
  /** The sentence did not say what kind of help (cook / get food / snack). */
  | { status: "needs_mode" }
  | { status: "needs_answers"; mode: DecisionMode; forms: FormValues; said: Said[]; missing: ClarifyStep[] }
  | { status: "ready"; mode: DecisionMode; forms: FormValues; said: Said[] };

/**
 * `remembered` says which modes have a real earlier session behind them: for a
 * mode with none, the form's non-null values are the plain starting choices,
 * not something the person told us, so they do not count as answered where a
 * request depends on them (Eat out's method).
 */
export function applyInterpretation(i: Interpretation, forms: FormValues, remembered: Record<DecisionMode, boolean>, forcedMode?: DecisionMode): Applied {
  const mode = forcedMode ?? i.mode;
  if (!mode) return { status: "needs_mode" };
  const said = new Set<Said>();

  if (mode === "cook") {
    const cook: CookForm = { ...forms.cook };
    if (i.hunger) {
      cook.hunger = i.hunger;
      said.add("hunger");
    }
    if (i.minutes !== null) {
      cook.cook_minutes = i.minutes;
      said.add("time");
    }
    if (i.effort) {
      cook.effort = i.effort;
      said.add("effort");
    }
    if (i.shopping) {
      cook.shopping = i.shopping;
      said.add("shopping");
    }
    if (i.extra_spend_usd !== null && i.shopping !== "inventory_only") {
      cook.budget_override_usd = i.extra_spend_usd;
      said.add("budget");
      // Saying how much they would spend is saying whether they would shop:
      // some money means they can buy, none means use what they have.
      if (!i.shopping) {
        cook.shopping = i.extra_spend_usd > 0 ? "can_buy" : "inventory_only";
        said.add("shopping");
      }
    }
    // Tonight's foods and the craving are never remembered between meals, so
    // they are exactly what was said — never what an earlier meal left behind.
    cook.ingredients_on_hand = i.foods;
    cook.craving = i.craving;
    cook.minimize_purchases = false;
    if (i.foods.length > 0) said.add("foods");
    if (i.craving) said.add("craving");

    return finish(mode, { ...forms, cook }, said, missingCook(cook));
  }

  if (mode === "order") {
    const order: OrderContext = { ...forms.order };
    if (i.hunger) {
      order.hunger = i.hunger;
      said.add("hunger");
    }
    if (i.method) {
      order.method = i.method;
      said.add("method");
    }
    if (i.distance && asksTravel(order.method)) {
      order.travel_willingness = i.distance;
      said.add("distance");
    }
    if (i.meal_budget) {
      order.meal_budget = i.meal_budget;
      said.add("meal_budget");
    }
    if (i.craving_category) order.craving_category = i.craving_category;
    order.craving_note = i.craving;
    if (i.craving) said.add("craving");
    return finish(mode, { ...forms, order }, said, missingOrder(!!i.method || remembered.order));
  }

  const snack: StoreSnackContext = { ...forms.store_snack };
  if (i.hunger) {
    snack.hunger = i.hunger;
    said.add("hunger");
  }
  if (i.snack_craving) {
    snack.craving_type = i.snack_craving;
    said.add("craving_type");
  }
  return finish(mode, { ...forms, store_snack: snack }, said, []);
}

/** What a Cook request still cannot go without, in question order. */
export function missingCook(form: CookForm): ClarifyStep[] {
  const missing: ClarifyStep[] = missingCookAnswers(form);
  if (form.shopping === "inventory_only" && form.ingredients_on_hand.length === 0) missing.push("ingredients");
  return missing;
}

/** Eat out's one blocker: how they are getting food, unless they said so or a
 *  real earlier session did. */
export function missingOrder(methodAnswered: boolean): ClarifyStep[] {
  return methodAnswered ? [] : ["method"];
}

function finish(mode: DecisionMode, forms: FormValues, said: Set<Said>, missing: ClarifyStep[]): Applied {
  return missing.length === 0
    ? { status: "ready", mode, forms, said: [...said] }
    : { status: "needs_answers", mode, forms, said: [...said], missing };
}

/** Whether a Cook form can become a request — the same test the question flow
 *  uses, plus: "Use what I have" is not a request without foods. */
export function cookReady(form: CookForm): boolean {
  return toMealContext(form) !== null && !(form.shopping === "inventory_only" && form.ingredients_on_hand.length === 0);
}

/** The "what I understood" panel: the parts of the request, each marked as
 *  said or assumed, plus the foods and craving that were named. The sentence
 *  itself is kept only in memory, only to show it back — never stored. */
export type Understood = {
  text: string;
  parts: { text: string; said: boolean }[];
  foods: string[];
  craving: string | null;
};

export function describeUnderstanding(text: string, mode: DecisionMode, forms: FormValues, said: Said[]): Understood {
  const form = forms[mode];
  const stated = new Set<Said>(said);
  return {
    text,
    parts: summaryParts(form).map((p) => ({ text: p.text, said: stated.has(p.field) })),
    foods: form.decision_mode === "cook" ? form.ingredients_on_hand : [],
    craving: form.decision_mode === "cook" ? form.craving : form.decision_mode === "order" ? form.craving_note : null,
  };
}
