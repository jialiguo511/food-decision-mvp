// Home's question flow: which questions exist for which answers, and how the
// screens move. Pure logic — no React, no requests.

import { describe, expect, it } from "vitest";
import { baseDefaults } from "@/lib/recommend/rememberedDefaults";
import { cookContext } from "@/test/cookFixtures";
import type { CookForm, DecisionMode, OrderContext } from "@/lib/types";
import { homeReducer, initialScreen, modeToChange, type Screen } from "./homeReducer";
import { autoAdvances, cookSteps, ingredientsStepIndex, orderSteps, searchesNearby, snackSteps, STEP_KINDS, stepKind, type Step } from "./steps";
import { contextSummary, ctaLabel, loadingLines } from "./summary";

const d = baseDefaults();
const cook = (o: Partial<CookForm> = {}): CookForm => ({ ...cookContext(), ...o });
const order = (o: Partial<OrderContext> = {}): OrderContext => ({ ...d.order, ...o });

describe("question steps", () => {
  it("asks 'How far would you go?' for Eat nearby and Pickup, never Delivery", () => {
    expect(orderSteps(order({ method: "eat_nearby" }))).toContain("travel");
    expect(orderSteps(order({ method: "pickup" }))).toContain("travel");
    expect(orderSteps(order({ method: "delivery" }))).not.toContain("travel");
    expect(orderSteps(order({ method: "pickup" }))[0]).toBe("method");
  });

  it("Pickup/Eat nearby search real places; Delivery gets food ideas by type", () => {
    expect(searchesNearby(order({ method: "pickup" }))).toBe(true);
    expect(searchesNearby(order({ method: "eat_nearby" }))).toBe(true);
    expect(searchesNearby(order({ method: "delivery" }))).toBe(false);
  });

  it("Cook asks the budget only when buying, and today's foods only for 'Use what I have'", () => {
    expect(cookSteps(cook({ shopping: "can_buy" }))).toEqual(["hunger", "time_effort", "shopping", "budget", "craving"]);
    expect(cookSteps(cook({ shopping: "inventory_only" }))).toEqual([
      "hunger",
      "time_effort",
      "shopping",
      "ingredients",
      "craving",
    ]);
  });

  it("a restored 'Use what I have' can be taken straight to the foods question", () => {
    expect(cookSteps(cook({ shopping: "inventory_only" }))[ingredientsStepIndex(cook())]).toBe("ingredients");
  });

  it("Snack is two questions", () => {
    expect(snackSteps()).toEqual(["hunger", "craving"]);
  });
});

describe("homeReducer", () => {
  it("opens on results for a restored session, else onboarding, else start", () => {
    expect(initialScreen({ hasSession: true, needsOnboarding: true })).toEqual({ name: "results" });
    expect(initialScreen({ hasSession: false, needsOnboarding: true })).toEqual({ name: "onboarding" });
    expect(initialScreen({ hasSession: false, needsOnboarding: false })).toEqual({ name: "start" });
  });

  it("a mode with memory opens on its own screen; a mode without goes straight to question 1", () => {
    expect(homeReducer({ name: "start" }, { type: "pickMode", mode: "order", hasMemory: true })).toEqual({
      name: "mode",
      mode: "order",
    });
    expect(homeReducer({ name: "start" }, { type: "pickMode", mode: "cook", hasMemory: false })).toEqual({
      name: "questions",
      mode: "cook",
      step: 0,
      viaMode: false,
    });
  });

  it("moves forward without passing the last question", () => {
    let s: Screen = { name: "questions", mode: "store_snack", step: 0, viaMode: false };
    s = homeReducer(s, { type: "next", stepCount: 2, from: 0 });
    expect(s).toMatchObject({ step: 1 });
    s = homeReducer(s, { type: "next", stepCount: 2, from: 1 });
    expect(s).toMatchObject({ step: 1 });
  });

  it("a move made on a question the screen has already left is ignored (auto-advance vs Back / Continue)", () => {
    const q2: Screen = { name: "questions", mode: "cook", step: 1, viaMode: true };
    // The 220 ms timer from question 1 fires after the user pressed Continue (now on 2)...
    expect(homeReducer(q2, { type: "next", stepCount: 5, from: 0 })).toBe(q2);
    // ...or after they pressed Back to question 0.
    const q0 = homeReducer(q2, { type: "back" });
    expect(homeReducer(q0, { type: "next", stepCount: 5, from: 1 })).toBe(q0);
    // Continue and the timer both naming the same question can only advance once.
    const once = homeReducer(q0, { type: "next", stepCount: 5, from: 0 });
    expect(once).toMatchObject({ step: 1 });
    expect(homeReducer(once, { type: "next", stepCount: 5, from: 0 })).toBe(once);
  });

  it("Back returns to the exact previous question; the answers live in the forms, so they are intact", () => {
    let s: Screen = { name: "questions", mode: "cook", step: 0, viaMode: false };
    s = homeReducer(s, { type: "next", stepCount: 5, from: 0 });
    s = homeReducer(s, { type: "next", stepCount: 5, from: 1 });
    expect(s).toMatchObject({ step: 2 });
    s = homeReducer(s, { type: "back" });
    expect(s).toMatchObject({ step: 1 });
  });

  it("'Edit' can open a mode at a given question", () => {
    expect(homeReducer({ name: "mode", mode: "cook" }, { type: "customize", mode: "cook", step: 3 })).toEqual({
      name: "questions",
      mode: "cook",
      step: 3,
      viaMode: true,
    });
  });

  it("the equipment question is its own screen; Back leaves it for Start", () => {
    const s = homeReducer({ name: "start" }, { type: "askEquipment" });
    expect(s).toEqual({ name: "equipment" });
    expect(homeReducer(s, { type: "back" })).toEqual({ name: "start" });
  });

  it("Back from the first question goes where you came from: the mode screen, or Start", () => {
    const viaMode = homeReducer({ name: "mode", mode: "cook" }, { type: "customize", mode: "cook" });
    expect(viaMode).toEqual({ name: "questions", mode: "cook", step: 0, viaMode: true });
    expect(homeReducer(viaMode, { type: "back" })).toEqual({ name: "mode", mode: "cook" });
    expect(homeReducer({ name: "mode", mode: "cook" }, { type: "back" })).toEqual({ name: "start" });

    const direct = homeReducer({ name: "start" }, { type: "pickMode", mode: "cook", hasMemory: false });
    expect(homeReducer(direct, { type: "back" })).toEqual({ name: "start" });
  });

  it("Back from a later question steps back one question", () => {
    expect(homeReducer({ name: "questions", mode: "cook", step: 2, viaMode: true }, { type: "back" })).toMatchObject({ step: 1 });
  });

  it("the nutrition step opens from and returns to the results", () => {
    const open = homeReducer({ name: "results" }, { type: "openNutrition" });
    expect(open).toEqual({ name: "nutrition" });
    expect(homeReducer(open, { type: "back" })).toEqual({ name: "results" });
    expect(homeReducer(open, { type: "nutritionDone" })).toEqual({ name: "results" });
  });

  it("'next' outside the questions changes nothing", () => {
    expect(homeReducer({ name: "results" }, { type: "next", stepCount: 3, from: 0 })).toEqual({ name: "results" });
  });
});

describe("modeToChange", () => {
  it("after a failed first request (no session), returns to the mode that was requested — not Cook", () => {
    expect(modeToChange(null, "order")).toBe("order");
    expect(modeToChange(null, "store_snack")).toBe("store_snack");
  });

  it("with a session on screen, the session's mode wins", () => {
    expect(modeToChange("order", "cook")).toBe("order");
    expect(modeToChange("cook", null)).toBe("cook");
  });

  it("only falls back to Cook when nothing is known", () => {
    expect(modeToChange(null, null)).toBe("cook");
  });
});

describe("contextSummary", () => {
  it("summarizes an Eat out usual, leaving out 'no preference' answers", () => {
    expect(
      contextSummary(order({ hunger: "very_hungry", method: "eat_nearby", travel_willingness: "nearby", meal_budget: "15_to_25" })),
    ).toEqual(["Starving", "Eat nearby", "Nearby", "$15–25"]);
    expect(contextSummary(order({ method: "delivery", travel_willingness: "walkable" }))).toEqual(["Normal hunger", "Delivery"]);
  });

  it("shows the Cook budget that will apply, including a $0 override", () => {
    expect(contextSummary(cook())).toEqual(["Normal hunger", "30 min", "A little effort", "~$12 to spend"]);
    expect(contextSummary(cook({ budget_override_usd: 0 }))).toContain("~$0 to spend");
  });
});

describe("ctaLabel", () => {
  it("names what will happen, per mode and method", () => {
    expect(ctaLabel(cook())).toBe("Show me meals");
    expect(ctaLabel(order({ method: "eat_nearby" }))).toBe("Find food nearby");
    expect(ctaLabel(order({ method: "pickup" }))).toBe("Find food nearby");
    expect(ctaLabel(order({ method: "delivery" }))).toBe("Find something to order");
    expect(ctaLabel(d.store_snack)).toBe("Find me a snack");
  });
});

describe("loadingLines", () => {
  it("states only what is true of this request, and always ends on 'Narrowing it down to 3'", () => {
    const lines = loadingLines(cookContext({ shopping: "inventory_only", cook_minutes: 10 }), { avoidsFoods: false });
    expect(lines).toEqual(["Using what you have", "Keeping prep under 10 min", "Narrowing it down to 3"]);
    expect(loadingLines(cookContext(), { avoidsFoods: true })).toContain("Leaving out foods you avoid");
    expect(loadingLines(cookContext(), { avoidsFoods: false })).not.toContain("Leaving out foods you avoid");
  });

  it("names the travel limit only when it was asked and answered", () => {
    expect(loadingLines(order({ method: "eat_nearby", travel_willingness: "walkable" }), { avoidsFoods: false })).toContain("Staying walkable");
    expect(loadingLines(order({ method: "delivery", travel_willingness: "walkable" }), { avoidsFoods: false }).join()).not.toMatch(/walkable/i);
    expect(loadingLines(order({ method: "eat_nearby" }), { avoidsFoods: false }).join()).not.toMatch(/Staying/);
  });

  it("never lists more than four lines", () => {
    const lines = loadingLines(order({ method: "eat_nearby", travel_willingness: "nearby", meal_budget: "15_to_25" }), { avoidsFoods: true });
    expect(lines).toHaveLength(4);
  });
});

describe("when an answer moves on by itself (one rule, by kind of input)", () => {
  it("every question has a kind, and only a pure single choice moves on by itself", () => {
    const expected = {
      cook: { hunger: true, time_effort: false, shopping: true, budget: false, ingredients: false, craving: false },
      order: { method: true, hunger: true, craving: false, budget: true, travel: true },
      store_snack: { hunger: true, craving: true },
    } as const;
    for (const [mode, steps] of Object.entries(expected)) {
      for (const [step, auto] of Object.entries(steps)) {
        expect(autoAdvances(mode as DecisionMode, step as Step), `${mode}/${step}`).toBe(auto);
      }
    }
  });

  it("the table covers every step each mode can ask — a new question can't be forgotten", () => {
    const asked = {
      cook: new Set([...cookSteps(cook({ shopping: "can_buy" })), ...cookSteps(cook({ shopping: "inventory_only" }))]),
      order: new Set([...orderSteps(order({ method: "pickup" })), ...orderSteps(order({ method: "delivery" }))]),
      store_snack: new Set(snackSteps()),
    };
    for (const mode of ["cook", "order", "store_snack"] as const) {
      expect([...asked[mode]].sort(), mode).toEqual(Object.keys(STEP_KINDS[mode]).sort());
    }
  });

  it("names the kind of each non-auto screen: several controls, multi, text, reveals-more", () => {
    expect(stepKind("cook", "time_effort")).toBe("composite");
    expect(stepKind("cook", "ingredients")).toBe("multi");
    expect(stepKind("cook", "craving")).toBe("text");
    expect(stepKind("order", "craving")).toBe("text");
    expect(stepKind("cook", "budget")).toBe("reveals"); // Eat out's budget is a plain single choice
    expect(stepKind("order", "budget")).toBe("single");
  });
});

describe("summary only states answers that exist", () => {
  it("an unanswered Cook form claims nothing", () => {
    expect(contextSummary(cook({ cook_minutes: null, effort: null, shopping: null, budget_override_usd: null }))).toEqual(["Normal hunger"]);
  });

  it("buying with no amount yet says so rather than inventing one", () => {
    expect(contextSummary(cook({ budget_override_usd: null }))).toEqual(["Normal hunger", "30 min", "A little effort", "Can buy a few things"]);
  });

  it("'Use what I have' is stated as the assumption", () => {
    expect(contextSummary(cook({ shopping: "inventory_only" }))).toContain("Use what I have");
  });
});
