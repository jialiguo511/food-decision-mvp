// Adjusting the request on screen: the six situations people actually hit, plus the rules that keep
// it honest. The reader (a model) is out of the picture here — each test hands in what the reader
// would return for the sentence in the title, and checks what the app then does with it.

import { describe, expect, it } from "vitest";
import { parseInterpretation, type Interpretation } from "@/lib/interpret/schema";
import { baseDefaults, rememberedDefaults, type FormDefaults } from "@/lib/recommend/rememberedDefaults";
import { toMealContext } from "@/lib/recommend/cookForm";
import { cookContext } from "@/test/cookFixtures";
import type { DecisionContext, OpenContext, OrderContext, StoreSnackContext } from "@/lib/types";
import { adjustRequest, interpretationOf, mergeAdjustment, quickDelta, wayOf } from "./adjust";
import type { FormValues } from "./QuestionFlow";

const read = (o: Record<string, unknown>): Interpretation => parseInterpretation(o);
const formsOf = (d: FormDefaults): FormValues => ({ cook: d.cook, order: d.order, store_snack: d.store_snack });
const NEW = baseDefaults();
const RETURNING = rememberedDefaults([cookContext({ cook_minutes: 30, effort: "some", shopping: "can_buy", budget_override_usd: 10 })]);

const SNACK: StoreSnackContext = { decision_mode: "store_snack", hunger: "light", craving_type: "sweet" };
const COOK = cookContext({ cook_minutes: 20, effort: "some", shopping: "can_buy", budget_override_usd: 15, hunger: "very_hungry", craving: "something warm", ingredients_on_hand: ["eggs", "rice"] });
const ORDER: OrderContext = { decision_mode: "order", hunger: "normal", craving_category: "warm_comforting", craving_note: "noodles", method: "delivery", meal_budget: "15_to_25", travel_willingness: "no_preference" };
const OPEN: OpenContext = {
  decision_mode: "open", hunger: "very_hungry", ways: { cook: true, buy: true }, minutes: 25, effort: null, extra_spend_usd: null, meal_budget: "no_preference",
  ingredients_on_hand: ["eggs"], craving: null, after_exercise: true, protein_focus: true, easy_pick: false, meal_only: false,
};

const adjust = (current: DecisionContext, delta: Record<string, unknown>, d: FormDefaults = NEW) => {
  const out = adjustRequest(current, read(delta), formsOf(d), d.remembered);
  if (out.kind !== "applied") throw new Error("expected a change, got: unchanged");
  return out;
};

describe("the six situations", () => {
  it("Snack → 'no more snacks, I'll cook a proper meal': becomes Cook, keeps hunger, asks only what Cook can't go without", () => {
    const { applied, switched } = adjust(SNACK, { mode: "cook", ways: ["cook"], meal_type: "meal" });
    expect(switched).toBe(true);
    expect(applied.status).toBe("needs_answers");
    if (applied.status !== "needs_answers") return;
    expect(applied.mode).toBe("cook");
    expect(applied.forms.cook.hunger).toBe("light"); // carried over from the snack request
    // A new user has no remembered time/effort/shopping → asked; nothing else is.
    expect(applied.missing).toEqual(["time_effort", "shopping"]);
  });

  it("…and for a returning user the same words go straight through (real earlier answers fill the gaps)", () => {
    const { applied } = adjust(SNACK, { mode: "cook", ways: ["cook"], meal_type: "meal" }, RETURNING);
    expect(applied.status).toBe("ready");
    if (applied.status !== "ready") return;
    expect(toMealContext(applied.forms.cook)).toMatchObject({ hunger: "light", cook_minutes: 30, effort: "some", shopping: "can_buy" });
  });

  it("Cook → 'I don't want to cook, buy something ready-made, a proper meal': Open, buying only, no snack cards — not locked in Cook", () => {
    const { applied, switched } = adjust(COOK, { ways: ["buy"], meal_type: "meal" });
    expect(switched).toBe(true);
    expect(applied.status).toBe("open");
    if (applied.status !== "open") return;
    expect(applied.context.ways).toEqual({ cook: false, buy: true });
    expect(applied.context.meal_only).toBe(true);
    // What still means something carries over; cooking-only answers don't make a cooking limit.
    expect(applied.context.hunger).toBe("very_hungry");
    expect(applied.context.craving).toBe("something warm");
    // Cooking-only answers (time, foods at home) are not carried into a buy-only request.
    expect(applied.context).toMatchObject({ minutes: null, effort: null, ingredients_on_hand: [] });
  });

  it("Open → 'no cooking': keeps hunger, exercise, protein and the rest; only the way changes", () => {
    const { applied } = adjust(OPEN, { ways: ["buy"] });
    expect(applied.status).toBe("open");
    if (applied.status !== "open") return;
    expect(applied.context).toMatchObject({ ways: { cook: false, buy: true }, hunger: "very_hungry", after_exercise: true, protein_focus: true, minutes: null, ingredients_on_hand: [], meal_only: false });
    // …and when cooking is allowed again, a fresh read of the same request keeps them (they live in the base, not in this one request).
    const both = adjust(OPEN, { hunger: "light" }).applied;
    expect(both.status === "open" && both.context).toMatchObject({ minutes: 25, ingredients_on_hand: ["eggs"] });
  });

  it("Cook → 'same, but the budget down to $10': only the budget changes", () => {
    const { applied, switched } = adjust(COOK, { extra_spend_usd: 10 });
    expect(switched).toBe(false);
    expect(applied.status).toBe("ready");
    if (applied.status !== "ready") return;
    expect(toMealContext(applied.forms.cook)).toMatchObject({ budget_override_usd: 10, cook_minutes: 20, hunger: "very_hungry", craving: "something warm", ingredients_on_hand: ["eggs", "rice"], shopping: "can_buy" });
  });

  it("Eat out → 'cheaper, under $15': the meal budget band changes, the method and craving stay", () => {
    const { applied } = adjust(ORDER, { meal_budget: "under_15" });
    expect(applied.status).toBe("ready");
    if (applied.status !== "ready" || applied.mode !== "order") return;
    expect(applied.forms.order).toMatchObject({ meal_budget: "under_15", method: "delivery", craving_note: "noodles", craving_category: "warm_comforting" });
  });
});

describe("a budget for a request that has none changes nothing — and says so instead of re-asking", () => {
  it("a snack has no budget", () => {
    expect(adjustRequest(SNACK, read({ extra_spend_usd: 10 }), formsOf(NEW), NEW.remembered)).toEqual({ kind: "unchanged" });
  });
  it("saying the same thing again is no change", () => {
    expect(adjustRequest(COOK, read({ hunger: "very_hungry" }), formsOf(NEW), NEW.remembered)).toEqual({ kind: "unchanged" });
  });
});

describe("how people get food and what kind of eating are separate", () => {
  it("'a proper meal' alone (no snacks) leaves Snack for an Open, meal-only request — it does NOT force Cook", () => {
    const { applied } = adjust(SNACK, { meal_type: "meal" });
    expect(applied.status).toBe("open");
    if (applied.status !== "open") return;
    expect(applied.context).toMatchObject({ meal_only: true, ways: { cook: true, buy: true }, hunger: "light" });
  });

  it("'I'll cook' does not by itself mean a proper meal, and 'a proper meal' does not mean cooking", () => {
    const cook = adjust(ORDER, { mode: "cook", ways: ["cook"] }).applied;
    expect(cook.status === "open" ? "open" : cook.mode).toBe("cook"); // cooking: a Cook request…
    const open = adjust(ORDER, { meal_type: "meal", ways: ["cook", "buy"] }).applied;
    expect(open.status).toBe("open"); // …while a meal that can be cooked or bought is Open
    if (open.status === "open") expect(open.context.meal_only).toBe(true);
  });

  it("buying only, a snack: becomes Snack; buying only with a method named: Eat out", () => {
    const snack = adjust(COOK, { ways: ["buy"], meal_type: "snack" }).applied;
    expect(snack.status === "open" ? "open" : snack.mode).toBe("store_snack");
    const out = adjust(COOK, { ways: ["buy"], method: "eat_nearby" }, RETURNING).applied;
    expect(out.status === "open" ? "open" : out.mode).toBe("order");
  });

  it("a snack stays a snack through a plain 'buy something instead'; a switch to cooking drops the snack", () => {
    const stays = mergeAdjustment(interpretationOf(SNACK), read({ ways: ["buy"] }));
    expect(stays.meal_type).toBe("snack");
    const leaves = mergeAdjustment(interpretationOf(SNACK), read({ mode: "cook", ways: ["cook"] }));
    expect(leaves.meal_type).toBeNull();
  });
});

describe("what was dropped stays dropped", () => {
  it("'no time limit now': the remembered 30 minutes is not put back", () => {
    // Open request with a stated 25 minutes, then the person drops the limit.
    const { applied } = adjust(OPEN, { clear: ["minutes"] });
    expect(applied.status === "open" && applied.context.minutes).toBeNull();
  });

  it("a Cook limit dropped while going to Cook from elsewhere is asked again, never defaulted from history", () => {
    // Returning user: history says 30 minutes. They switch to Cook but say there is no time limit.
    const { applied } = adjust(OPEN, { mode: "cook", ways: ["cook"], clear: ["minutes"] }, RETURNING);
    expect(applied.status).toBe("needs_answers");
    if (applied.status !== "needs_answers") return;
    expect(applied.forms.cook.cook_minutes).toBeNull();
    expect(applied.missing).toContain("time_effort");
  });

  it("'forget the budget' on Eat out goes back to no preference; 'don't mind how far' likewise", () => {
    const { applied } = adjust({ ...ORDER, method: "eat_nearby", travel_willingness: "walkable" }, { clear: ["budget", "distance"] });
    if (applied.status !== "ready" || applied.mode !== "order") throw new Error("expected Eat out");
    expect(applied.forms.order).toMatchObject({ meal_budget: "no_preference", travel_willingness: "no_preference" });
  });

  it("'I don't have those any more' empties the foods; new foods are added to the rest", () => {
    expect(mergeAdjustment(interpretationOf(COOK), read({ clear: ["foods"] })).foods).toEqual([]);
    expect(mergeAdjustment(interpretationOf(COOK), read({ foods: ["tofu"] })).foods).toEqual(["eggs", "rice", "tofu"]);
  });

  it("an unmentioned condition is never cleared", () => {
    const merged = mergeAdjustment(interpretationOf(COOK), read({ hunger: "light" }));
    expect(merged).toMatchObject({ minutes: 20, effort: "some", foods: ["eggs", "rice"], craving: "something warm" });
  });
});

describe("the request keeps its own rules", () => {
  it("saying how much they'd spend implies they can shop, the same as in a first sentence", () => {
    const strict = cookContext({ shopping: "inventory_only", ingredients_on_hand: ["eggs"], cook_minutes: 15, effort: "some" });
    const merged = mergeAdjustment(interpretationOf(strict), read({ extra_spend_usd: 10 }));
    expect(merged.shopping).toBe("can_buy");
  });

  it("the Profile's hard constraints are not part of any of this: the reader can't set them and nothing here carries them", () => {
    // `allergies`, `dietary` and the like are not fields of an Interpretation at all.
    const keys = Object.keys(read({ allergies: ["peanuts"], dietary: "vegan" }));
    expect(keys.some((k) => /allerg|diet/.test(k))).toBe(false);
  });

  it("each way is named for the reader, and nothing else about the request is", () => {
    expect([SNACK, COOK, ORDER, OPEN].map(wayOf)).toEqual(["store_snack", "cook", "order", "open"]);
  });

  it("the one-tap changes are fixed deltas", () => {
    expect(quickDelta("cook")).toMatchObject({ mode: "cook", ways: ["cook"] });
    expect(quickDelta("order")).toMatchObject({ mode: "order" });
    expect(quickDelta("snack")).toMatchObject({ mode: "store_snack", meal_type: "snack" });
    const { applied } = adjust(COOK, { ...quickDelta("snack") });
    expect(applied.status === "open" ? "open" : applied.mode).toBe("store_snack");
  });
});
