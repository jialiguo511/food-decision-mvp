// How a read sentence merges into Home's answers. The rules that matter: only
// what was said is "said"; a real earlier answer may fill a gap but never beats
// the sentence; nothing is invented; and only what a request truly cannot go
// without is asked for.

import { describe, expect, it } from "vitest";
import { isEmptyInterpretation, parseInterpretation, type Interpretation } from "@/lib/interpret/schema";
import { baseDefaults, rememberedDefaults, type FormDefaults } from "@/lib/recommend/rememberedDefaults";
import { toMealContext } from "@/lib/recommend/cookForm";
import { cookContext } from "@/test/cookFixtures";
import { applyInterpretation, changeTarget, cookReady, describeOpenUnderstanding, describeUnderstanding, stepForField, stepIndexForField } from "./interpret";
import type { FormValues } from "./QuestionFlow";

const read = (o: Record<string, unknown>): Interpretation => parseInterpretation(o);
const formsOf = (d: FormDefaults): FormValues => ({ cook: d.cook, order: d.order, store_snack: d.store_snack });
const NEW = baseDefaults();
const RETURNING = rememberedDefaults([cookContext({ cook_minutes: 30, effort: "some", shopping: "can_buy", budget_override_usd: 10 })]);

describe("Cook", () => {
  it("a new user's sentence fills what it said and asks only for what a request can't go without", () => {
    const applied = applyInterpretation(read({ mode: "cook", hunger: "very_hungry", minutes: 20, foods: ["eggs", "rice"] }), formsOf(NEW), NEW.remembered);
    expect(applied.status).toBe("needs_answers");
    if (applied.status !== "needs_answers") return;
    expect(applied.mode).toBe("cook");
    // Effort and shopping were not said and nothing real supplies them → asked. Time was said → not asked again.
    expect(applied.missing).toEqual(["time_effort", "shopping"]);
    expect(applied.forms.cook).toMatchObject({ hunger: "very_hungry", cook_minutes: 20, ingredients_on_hand: ["eggs", "rice"], effort: null, shopping: null });
    expect(applied.said.sort()).toEqual(["foods", "hunger", "time"]);
  });

  it("having food at home does not decide shopping", () => {
    const applied = applyInterpretation(read({ mode: "cook", foods: ["eggs"] }), formsOf(NEW), NEW.remembered);
    expect(applied.status === "needs_answers" && applied.forms.cook.shopping).toBeNull();
  });

  it("a returning user's real earlier answers fill the gaps — but those are assumed, not said", () => {
    const applied = applyInterpretation(read({ mode: "cook", hunger: "very_hungry", foods: ["eggs", "rice"] }), formsOf(RETURNING), RETURNING.remembered);
    expect(applied.status).toBe("ready");
    if (applied.status !== "ready") return;
    expect(toMealContext(applied.forms.cook)).toMatchObject({ cook_minutes: 30, effort: "some", shopping: "can_buy", budget_override_usd: 10, hunger: "very_hungry", ingredients_on_hand: ["eggs", "rice"] });
    const u = describeUnderstanding("x", "cook", applied.forms, applied.said);
    expect(u.parts.find((p) => p.text === "Starving")?.said).toBe(true);
    expect(u.parts.find((p) => p.text === "30 min")?.said).toBe(false); // from history, not the sentence
  });

  it("what the sentence says beats what was remembered", () => {
    const applied = applyInterpretation(read({ mode: "cook", minutes: 15, effort: "minimal", shopping: "inventory_only", foods: ["eggs"] }), formsOf(RETURNING), RETURNING.remembered);
    expect(applied.status).toBe("ready");
    if (applied.status === "ready") expect(applied.forms.cook).toMatchObject({ cook_minutes: 15, effort: "minimal", shopping: "inventory_only" });
  });

  it("today's foods and craving are exactly what was said — never what an earlier meal left in the form", () => {
    const stale = formsOf(RETURNING);
    stale.cook = { ...stale.cook, ingredients_on_hand: ["chicken"], craving: "curry" };
    const applied = applyInterpretation(read({ mode: "cook", hunger: "light" }), stale, RETURNING.remembered);
    expect(applied.status === "ready" && applied.forms.cook).toMatchObject({ ingredients_on_hand: [], craving: null });
  });

  it("saying how much they'd spend says whether they'd shop: some money → can buy, none → use what I have", () => {
    const buy = applyInterpretation(read({ mode: "cook", minutes: 20, effort: "some", extra_spend_usd: 8 }), formsOf(NEW), NEW.remembered);
    expect(buy.status === "ready" && buy.forms.cook).toMatchObject({ shopping: "can_buy", budget_override_usd: 8 });
    const none = applyInterpretation(read({ mode: "cook", minutes: 20, effort: "some", extra_spend_usd: 0, foods: ["eggs"] }), formsOf(NEW), NEW.remembered);
    expect(none.status === "ready" && none.forms.cook.shopping).toBe("inventory_only");
  });

  it("'use what I have' with no foods named is not a request: it asks what they have, and nothing else", () => {
    const applied = applyInterpretation(read({ mode: "cook", minutes: 20, effort: "some", shopping: "inventory_only" }), formsOf(NEW), NEW.remembered);
    expect(applied.status === "needs_answers" && applied.missing).toEqual(["ingredients"]);
    expect(cookReady(formsOf(NEW).cook)).toBe(false);
  });

  it("'can buy' with no amount asks the budget — it is never invented", () => {
    const applied = applyInterpretation(read({ mode: "cook", minutes: 20, effort: "some", shopping: "can_buy" }), formsOf(NEW), NEW.remembered);
    expect(applied.status === "needs_answers" && applied.missing).toEqual(["budget"]);
    expect(applied.status === "needs_answers" && applied.forms.cook.budget_override_usd).toBeNull();
  });

  it("the merge never carries a leftover 'fewest purchases' flag", () => {
    const f = formsOf(RETURNING);
    f.cook = { ...f.cook, minimize_purchases: true };
    const applied = applyInterpretation(read({ mode: "cook", hunger: "normal" }), f, RETURNING.remembered);
    expect(applied.status === "ready" && applied.forms.cook.minimize_purchases).toBe(false);
  });
});

describe("Eat out and snack", () => {
  it("a new user who didn't say how they're getting food is asked — the preselected default is not an answer", () => {
    const applied = applyInterpretation(read({ mode: "order", hunger: "light" }), formsOf(NEW), NEW.remembered);
    expect(applied.status === "needs_answers" && applied.missing).toEqual(["method"]);
  });

  it("…but not when the sentence said it, or a real earlier Eat out session did", () => {
    expect(applyInterpretation(read({ mode: "order", method: "pickup" }), formsOf(NEW), NEW.remembered).status).toBe("ready");
    const used = { ...NEW.remembered, order: true };
    expect(applyInterpretation(read({ mode: "order" }), formsOf(NEW), used).status).toBe("ready");
  });

  it("a stated budget band and craving are applied; an unstated budget stays 'no preference'", () => {
    const a = applyInterpretation(read({ mode: "order", method: "delivery", meal_budget: "under_15", craving: "ramen", craving_category: "warm_comforting" }), formsOf(NEW), NEW.remembered);
    expect(a.status === "ready" && a.forms.order).toMatchObject({ meal_budget: "under_15", craving_note: "ramen", craving_category: "warm_comforting" });
    const b = applyInterpretation(read({ mode: "order", method: "delivery" }), formsOf(NEW), NEW.remembered);
    expect(b.status === "ready" && b.forms.order.meal_budget).toBe("no_preference");
  });

  it("a distance only counts for a way of getting food that has one", () => {
    const delivery = applyInterpretation(read({ mode: "order", method: "delivery", distance: "walkable" }), formsOf(NEW), NEW.remembered);
    expect(delivery.status === "ready" && delivery.forms.order.travel_willingness).toBe("no_preference");
    const nearby = applyInterpretation(read({ mode: "order", method: "eat_nearby", distance: "walkable" }), formsOf(NEW), NEW.remembered);
    expect(nearby.status === "ready" && nearby.forms.order.travel_willingness).toBe("walkable");
  });

  it("a snack never needs a question", () => {
    const a = applyInterpretation(read({ mode: "store_snack", snack_craving: "sweet" }), formsOf(NEW), NEW.remembered);
    expect(a.status === "ready" && a.forms.store_snack).toMatchObject({ craving_type: "sweet", hunger: "normal" });
  });

  it("fields meant for another mode are ignored", () => {
    const a = applyInterpretation(read({ mode: "store_snack", foods: ["eggs"], method: "pickup", minutes: 20 }), formsOf(NEW), NEW.remembered);
    expect(a.status === "ready" && a.forms.cook.ingredients_on_hand).toEqual([]);
  });
});

describe("one way, several ways, or unclear — the decision isn't always 'which mode'", () => {
  const apply = (o: Record<string, unknown>) => applyInterpretation(read(o), formsOf(NEW), NEW.remembered);
  const open = (o: Record<string, unknown>) => {
    const a = apply(o);
    if (a.status !== "open") throw new Error(`expected open, got ${a.status}`);
    return a;
  };

  it("'I can buy things or I can make something myself' is OPEN to both — not a missing mode", () => {
    const a = open({ hunger: "light", ways: ["cook", "buy"], protein_focus: true, after_exercise: true });
    expect(a.context).toMatchObject({ decision_mode: "open", hunger: "light", ways: { cook: true, buy: true }, protein_focus: true, after_exercise: true });
  });

  it("an explicit 'both' beats a stray single mode — they said both", () => {
    expect(open({ mode: "cook", ways: ["cook", "buy"] }).context.ways).toEqual({ cook: true, buy: true });
  });

  it("ruling cooking out ('I don't want to cook') is respected: buying only, never a recipe", () => {
    expect(open({ ways: ["buy"] }).context.ways).toEqual({ cook: false, buy: true });
  });

  it("ruling cooking out AND naming a way to get food ('something nearby', delivery) is one way — Eat out — not an open request", () => {
    const a = apply({ ways: ["buy"], method: "eat_nearby", effort: "minimal", meal_budget: "under_15" });
    expect(a.status).not.toBe("open");
    expect(a.status !== "open" && a.mode).toBe("order");
    // …but a stray method alongside "cook or buy" is still open: they said both.
    expect(open({ ways: ["cook", "buy"], method: "delivery" }).context.ways).toEqual({ cook: true, buy: true });
  });

  it("allowing ONLY cooking is a single Cook request, with the Cook questions it needs", () => {
    const a = apply({ ways: ["cook"] });
    expect(a.status).toBe("needs_answers");
    expect(a.status === "needs_answers" && a.mode).toBe("cook");
  });

  it("a named single way stays a single-mode request, exactly as before", () => {
    expect(apply({ mode: "order", method: "delivery" }).status).toBe("ready");
    expect(apply({ mode: "store_snack", snack_craving: "sweet" }).status).toBe("ready");
  });

  it("'only what I have at home' (cook + inventory-only + the foods named) is a single Cook request that honours the inventory", () => {
    const a = apply({ mode: "cook", shopping: "inventory_only", foods: ["eggs", "rice"] });
    expect(a.status === "needs_answers" && a.forms.cook).toMatchObject({ shopping: "inventory_only", ingredients_on_hand: ["eggs", "rice"] });
    expect(a.status === "needs_answers" && a.missing).not.toContain("ingredients"); // the foods were named
  });

  it("'just something' / 'you decide' is open and easy — nothing is asked first", () => {
    const a = open({ leave_to_us: true });
    expect(a.context).toMatchObject({ easy_pick: true, ways: { cook: true, buy: true } });
    expect(describeOpenUnderstanding("x", a.context, a.said).parts.find((p) => p.text === "Easy options")?.said).toBe(false); // the app's reading, shown as assumed
  });

  it("a sentence that says something real but names no way is open too — never forced into a classification", () => {
    expect(open({ hunger: "very_hungry" }).context.decision_mode).toBe("open");
    expect(open({ craving: "something spicy" }).context.craving).toBe("something spicy");
  });

  it("what was NOT said stays unknown: no time, effort, budget or foods are invented", () => {
    const { context } = open({ ways: ["cook", "buy"], hunger: "light" });
    expect(context).toMatchObject({ minutes: null, effort: null, extra_spend_usd: null, meal_budget: "no_preference", ingredients_on_hand: [], craving: null, after_exercise: false, protein_focus: false, easy_pick: false });
  });

  it("a remembered Profile or earlier answer is never turned into a condition the person set", () => {
    const returning = applyInterpretation(read({ ways: ["cook", "buy"] }), formsOf(RETURNING), RETURNING.remembered);
    expect(returning.status === "open" && returning.context).toMatchObject({ minutes: null, effort: null, extra_spend_usd: null });
  });

  it("stated limits ARE carried: time, effort, spend, budget, foods, craving", () => {
    const { context } = open({ ways: ["cook", "buy"], minutes: 15, effort: "minimal", extra_spend_usd: 6, meal_budget: "under_15", foods: ["eggs"], craving: "noodles" });
    expect(context).toMatchObject({ minutes: 15, effort: "minimal", extra_spend_usd: 6, meal_budget: "under_15", ingredients_on_hand: ["eggs"], craving: "noodles" });
  });

  it("'wants protein' is the person's wish — the panel never states a shortfall or a number", () => {
    const a = open({ ways: ["cook", "buy"], protein_focus: true, after_exercise: true });
    const texts = describeOpenUnderstanding("x", a.context, a.said).parts.map((p) => p.text).join(" | ");
    expect(texts).toContain("Wants protein");
    expect(texts).toContain("After exercise");
    expect(texts).not.toMatch(/short|low|deficit|missing|need|\d+\s?g/i);
  });

  it("a forced single mode (the equipment step resuming a Cook sentence) still wins", () => {
    const forced = applyInterpretation(read({ hunger: "very_hungry", foods: ["eggs"] }), formsOf(NEW), NEW.remembered, "cook");
    expect(forced.status === "needs_answers" && forced.forms.cook).toMatchObject({ hunger: "very_hungry", ingredients_on_hand: ["eggs"] });
  });

  it("an empty read is not open — it is 'nothing found', which the reader reports before any of this runs", () => {
    expect(isEmptyInterpretation(read({}))).toBe(true);
    expect(isEmptyInterpretation(read({ leave_to_us: true }))).toBe(false);
    expect(isEmptyInterpretation(read({ ways: ["buy"] }))).toBe(false);
  });
});

describe("the sentence never touches a hard constraint or the Profile", () => {
  it("the merged forms hold only the per-meal answers (no allergy, no diet, no profile field exists to be written)", () => {
    const a = applyInterpretation(read({ mode: "cook", minutes: 20, effort: "some", shopping: "can_buy", extra_spend_usd: 5 }), formsOf(NEW), NEW.remembered);
    if (a.status !== "ready") throw new Error("expected ready");
    const keys = Object.keys(a.forms.cook);
    expect(keys.filter((k) => /allerg|dietary|dislike|profile/i.test(k))).toEqual([]);
  });
});

describe("Change vs. editing one item", () => {
  it("a sentence decision changes back to the sentence; a questions decision to the questions", () => {
    const u = describeUnderstanding("x", "store_snack", formsOf(NEW), ["hunger"]);
    expect(changeTarget(u)).toBe("sentence");
    expect(changeTarget(null)).toBe("questions");
  });

  it("each item in 'What I understood' opens the question that edits it", () => {
    expect(stepForField("cook", NEW.cook, "time")).toBe("time_effort");
    expect(stepForField("cook", NEW.cook, "effort")).toBe("time_effort");
    expect(stepForField("cook", NEW.cook, "shopping")).toBe("shopping");
    expect(stepForField("cook", NEW.cook, "budget")).toBe("budget");
    expect(stepForField("cook", NEW.cook, "hunger")).toBe("hunger");
    expect(stepForField("order", NEW.order, "method")).toBe("method");
    expect(stepForField("order", NEW.order, "distance")).toBe("travel");
    expect(stepForField("order", NEW.order, "meal_budget")).toBe("budget");
    expect(stepForField("store_snack", NEW.store_snack, "craving_type")).toBe("craving");
  });

  it("today's foods sit on their own question for 'Use what I have', inside the budget question when shopping is allowed", () => {
    expect(stepForField("cook", { ...NEW.cook, shopping: "inventory_only" }, "foods")).toBe("ingredients");
    expect(stepForField("cook", { ...NEW.cook, shopping: "can_buy" }, "foods")).toBe("budget");
  });

  it("finds the question's place in the CURRENT list, and falls back to the first if it isn't there", () => {
    expect(stepIndexForField("cook", formsOf(NEW), "time")).toBe(1); // hunger, time_effort, …
    expect(stepIndexForField("order", formsOf(NEW), "distance")).toBe(0); // delivery asks no distance
    expect(stepIndexForField("order", { ...formsOf(NEW), order: { ...NEW.order, method: "eat_nearby" } }, "distance")).toBe(4);
  });
});
