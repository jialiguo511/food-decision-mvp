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
import { MEAL_BUDGETS } from "@/lib/options";
import type { CookForm, DecisionMode, OpenContext, OrderContext, StoreSnackContext } from "@/lib/types";
import type { FormValues } from "./QuestionFlow";
import { EFFORT_PHRASES, HUNGER_PHRASES, label, summaryParts, type SummaryField } from "./summary";
import { stepsFor, type Step } from "./steps";

export type Said = SummaryField | "foods" | "craving" | "ways" | "exercise" | "protein" | "easy";

/** What a request is still missing — the only things worth asking. */
export type ClarifyStep = "time_effort" | "shopping" | "budget" | "ingredients" | "method";

export type Applied =
  /** The person is open to more than one way of eating, or left it to us. Not a
   *  missing mode: the request itself is "help me decide how and what". It needs no
   *  follow-up — nothing here blocks an answer. */
  | { status: "open"; context: OpenContext; said: Said[] }
  | { status: "needs_answers"; mode: DecisionMode; forms: FormValues; said: Said[]; missing: ClarifyStep[] }
  | { status: "ready"; mode: DecisionMode; forms: FormValues; said: Said[] };

/**
 * `remembered` says which modes have a real earlier session behind them: for a
 * mode with none, the form's non-null values are the plain starting choices,
 * not something the person told us, so they do not count as answered where a
 * request depends on them (Eat out's method).
 */
export function applyInterpretation(i: Interpretation, forms: FormValues, remembered: Record<DecisionMode, boolean>, forcedMode?: DecisionMode): Applied {
  // Three readings of a sentence, in this order:
  //  1. it names ONE way (a mode, or "only cooking") → that mode, exactly as before;
  //  2. it says several ways are fine, leaves it to us, or names no way but says something
  //     real → OPEN: the decision includes which way;
  //  3. it says nothing readable → never gets here (the reader reports "nothing found" and
  //     the person keeps their text).
  // An explicit "both cook and buy" beats a stray single mode: they said both.
  let mode: DecisionMode | null = forcedMode ?? i.mode;
  if (!forcedMode) {
    const cook = i.ways.includes("cook");
    const buy = i.ways.includes("buy");
    if (cook && buy) mode = null;
    else if (cook && !mode) mode = "cook"; // only cooking is allowed: that is a Cook request
  }
  if (!mode) return openFrom(i);
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

/** The cross-way request. Everything not said stays unknown (null / empty); the only
 *  defaults are the neutral ones every flow starts from (normal hunger, no budget
 *  preference), and the person is shown them as assumed. */
function openFrom(i: Interpretation): Applied {
  const onlyBuy = i.ways.length > 0 && i.ways.includes("buy") && !i.ways.includes("cook");
  const context: OpenContext = {
    decision_mode: "open",
    hunger: i.hunger ?? "normal",
    // Said nothing → both are fine. Said only "buy" → no cooking. (Only "cook" never gets here.)
    ways: { cook: !onlyBuy, buy: true },
    minutes: i.minutes,
    effort: i.effort,
    extra_spend_usd: i.extra_spend_usd,
    meal_budget: i.meal_budget ?? "no_preference",
    ingredients_on_hand: i.foods,
    craving: i.craving,
    after_exercise: i.after_exercise === true,
    protein_focus: i.protein_focus === true,
    easy_pick: i.leave_to_us === true,
  };
  const said: Said[] = [];
  if (i.hunger) said.push("hunger");
  if (i.ways.length > 0) said.push("ways");
  if (i.minutes !== null) said.push("time");
  if (i.effort) said.push("effort");
  if (i.extra_spend_usd !== null) said.push("budget");
  if (i.meal_budget && i.meal_budget !== "no_preference") said.push("meal_budget");
  if (i.foods.length > 0) said.push("foods");
  if (i.craving) said.push("craving");
  if (context.after_exercise) said.push("exercise");
  if (context.protein_focus) said.push("protein");
  return { status: "open", context, said };
}

/** What an open request was understood as, for "What I understood": each part marked as
 *  said, or assumed (the app's own reading — "easy options" for "just something"). */
export function describeOpenUnderstanding(text: string, c: OpenContext, said: Said[]): Understood {
  const stated = new Set<Said>(said);
  // Hunger is shown only when the person said it: an unstated "normal" is a system
  // fallback, not something to present as their condition (see "Preferences have provenance").
  const parts: Understood["parts"] = [];
  if (stated.has("hunger")) parts.push({ text: HUNGER_PHRASES[c.hunger], said: true, field: "hunger" });
  parts.push(
    { text: c.ways.cook ? "Cook or buy" : "Buying, not cooking", said: stated.has("ways"), field: "ways" },
  );
  if (c.minutes !== null) parts.push({ text: `${c.minutes} min`, said: true, field: "time" });
  if (c.effort) parts.push({ text: EFFORT_PHRASES[c.effort], said: true, field: "effort" });
  if (c.extra_spend_usd !== null) parts.push({ text: `~$${c.extra_spend_usd} to spend`, said: true, field: "budget" });
  if (c.meal_budget !== "no_preference") parts.push({ text: label(MEAL_BUDGETS, c.meal_budget) ?? c.meal_budget, said: true, field: "meal_budget" });
  if (c.after_exercise) parts.push({ text: "After exercise", said: true, field: "exercise" });
  if (c.protein_focus) parts.push({ text: "Wants protein", said: true, field: "protein" });
  if (c.easy_pick) parts.push({ text: "Easy options", said: false, field: "easy" });
  return { text, parts, foods: c.ingredients_on_hand, craving: c.craving };
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
  /** `field` says which answer a chip is, so tapping it can open that question. */
  parts: { text: string; said: boolean; field?: Said }[];
  foods: string[];
  craving: string | null;
};

export function describeUnderstanding(text: string, mode: DecisionMode, forms: FormValues, said: Said[]): Understood {
  const form = forms[mode];
  const stated = new Set<Said>(said);
  return {
    text,
    parts: summaryParts(form).map((p) => ({ text: p.text, said: stated.has(p.field), field: p.field })),
    foods: form.decision_mode === "cook" ? form.ingredients_on_hand : [],
    craving: form.decision_mode === "cook" ? form.craving : form.decision_mode === "order" ? form.craving_note : null,
  };
}

/** Which question edits a given answer — so a chip in "What I understood" opens
 *  the matching field instead of the first question. Null when this mode has no
 *  question for it. Foods on hand live on their own question for "Use what I
 *  have" and inside the budget question when shopping is allowed. */
export function stepForField(mode: DecisionMode, form: FormValues[DecisionMode], field: Said): Step | null {
  if (field === "hunger") return "hunger";
  if (mode === "cook") {
    if (field === "time" || field === "effort") return "time_effort";
    if (field === "shopping") return "shopping";
    if (field === "budget") return "budget";
    if (field === "foods") return form.decision_mode === "cook" && form.shopping === "can_buy" ? "budget" : "ingredients";
    if (field === "craving") return "craving";
    return null;
  }
  if (mode === "order") {
    if (field === "method") return "method";
    if (field === "distance") return "travel";
    if (field === "meal_budget") return "budget";
    if (field === "craving") return "craving";
    return null;
  }
  return field === "craving_type" || field === "craving" ? "craving" : null;
}

/** The index of that question in the mode's current list (0 if it isn't there). */
export function stepIndexForField(mode: DecisionMode, forms: FormValues, field: Said): number {
  const step = stepForField(mode, forms[mode], field);
  const index = step ? stepsFor(forms[mode]).indexOf(step) : -1;
  return Math.max(index, 0);
}

/** Where "Change" goes. A decision that started from a typed sentence returns to
 *  that sentence (kept in memory only, to edit and send again); one that started
 *  from the questions returns to the questions. Editing one answer from "What I
 *  understood" is a different, narrower action and doesn't use this. */
export function changeTarget(understood: Understood | null): "sentence" | "questions" {
  return understood ? "sentence" : "questions";
}
