// The auto-advance rule, exercised through the real QuestionFlow: what a tap on
// each kind of screen does. QuestionFlow is a plain function component, so it
// is called directly and its element tree read — no DOM needed. The rule itself
// is steps.ts (STEP_KINDS); this proves the screens obey it, including the last
// question, and that Back / answers survive.

import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { baseDefaults } from "@/lib/recommend/rememberedDefaults";
import { cookContext } from "@/test/cookFixtures";
import type { CookForm, DecisionMode, OrderContext, StoreSnackContext } from "@/lib/types";
import { createAdvanceScheduler } from "./advance";
import { homeReducer, type Screen } from "./homeReducer";
import QuestionFlow, { type FormValues } from "./QuestionFlow";

const d = baseDefaults();
const forms = (over: { cook?: Partial<CookForm>; order?: Partial<OrderContext>; snack?: Partial<StoreSnackContext> } = {}): FormValues => ({
  cook: { ...cookContext(), ...over.cook },
  order: { ...d.order, ...over.order },
  store_snack: { ...d.store_snack, ...over.snack },
});

type Calls = { onNext: ReturnType<typeof vi.fn>; onFinish: ReturnType<typeof vi.fn>; setForm: ReturnType<typeof vi.fn> };

/** Renders the question and returns the elements inside it, plus the spies. */
function render(mode: DecisionMode, step: number, f: FormValues) {
  const calls: Calls = { onNext: vi.fn(), onFinish: vi.fn(), setForm: vi.fn() };
  const tree = QuestionFlow({
    mode,
    step,
    forms: f,
    setForm: calls.setForm as never,
    onNext: calls.onNext as never,
    onBack: () => {},
    onFinish: calls.onFinish as never,
    onIdeasByType: () => {},
    budgetUsual: null,
    kitchenStaples: [],
  }) as ReactElement<{ children: ReactNode }>;
  return { calls, body: tree.props.children };
}

/** Finds the first element in a tree with the given prop. */
function find(node: ReactNode, prop: string): ReactElement<Record<string, unknown>> | null {
  if (node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, prop);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.props && prop in el.props && typeof el.props[prop] === "function") return el;
  return el.props ? find(el.props.children as ReactNode, prop) : null;
}
const tap = (body: ReactNode, prop: "onPick" | "onChange", value: string) =>
  (find(body, prop)?.props[prop] as (v: string) => void)(value);

describe("A. a pure single choice moves on by itself", () => {
  it("Cook · How hungry are you?", () => {
    const { calls, body } = render("cook", 0, forms());
    tap(body, "onPick", "very_hungry");
    expect(calls.setForm).toHaveBeenCalledWith("cook", expect.objectContaining({ hunger: "very_hungry" }));
    expect(calls.onNext).toHaveBeenCalledWith(5, true, 0);
    expect(calls.onFinish).not.toHaveBeenCalled();
  });

  it("Cook · Shopping tonight?", () => {
    const { calls, body } = render("cook", 2, forms());
    tap(body, "onPick", "can_buy");
    expect(calls.onNext).toHaveBeenCalledWith(expect.any(Number), true, 2);
  });

  it("Get food · method, hunger and budget", () => {
    for (const [step, value] of [[0, "pickup"], [1, "light"], [3, "under_15"]] as const) {
      const { calls, body } = render("order", step, forms({ order: { method: "pickup" } }));
      tap(body, "onPick", value);
      expect(calls.onNext, `step ${step}`).toHaveBeenCalledWith(expect.any(Number), true, step);
    }
  });

  it("Snack · How hungry are you? moves on; What sounds good? (the last question) sends the request", () => {
    const hungry = render("store_snack", 0, forms());
    tap(hungry.body, "onPick", "light");
    expect(hungry.calls.onNext).toHaveBeenCalledWith(2, true, 0);

    const craving = render("store_snack", 1, forms());
    tap(craving.body, "onPick", "salty");
    expect(craving.calls.onFinish).toHaveBeenCalledWith(true);
    expect(craving.calls.onNext).not.toHaveBeenCalled();
  });

  it("Get food · How far would you go? (last, for Pickup / Eat nearby) sends the request", () => {
    const { calls, body } = render("order", 4, forms({ order: { method: "eat_nearby" } }));
    tap(body, "onPick", "walkable");
    expect(calls.setForm).toHaveBeenCalledWith("order", expect.objectContaining({ travel_willingness: "walkable" }));
    expect(calls.onFinish).toHaveBeenCalledWith(true);
  });
});

describe("B–E. everything else waits for the button", () => {
  it("B. multi-select: Cook · What do you have right now?", () => {
    const { calls, body } = render("cook", 3, forms({ cook: { shopping: "inventory_only" } }));
    (find(body, "onChange")?.props.onChange as (v: string[]) => void)(["Eggs", "Rice"]);
    expect(calls.setForm).toHaveBeenCalledWith("cook", expect.objectContaining({ ingredients_on_hand: ["Eggs", "Rice"] }));
    expect(calls.onNext).not.toHaveBeenCalled();
    expect(calls.onFinish).not.toHaveBeenCalled();
  });

  it("C. text / custom value: the Eat out craving chips + note, the Cook craving", () => {
    const eatOut = render("order", 2, forms());
    tap(eatOut.body, "onChange", "sweet");
    expect(eatOut.calls.setForm).toHaveBeenCalled();
    expect(eatOut.calls.onNext).not.toHaveBeenCalled();
    expect(eatOut.calls.onFinish).not.toHaveBeenCalled();

    const cook = render("cook", 4, forms());
    tap(cook.body, "onChange", "Something warm");
    expect(cook.calls.onNext).not.toHaveBeenCalled();
    expect(cook.calls.onFinish).not.toHaveBeenCalled();
  });

  it("several controls on one screen (Time + Cooking) wait for Continue, whichever is tapped", () => {
    const time = render("cook", 1, forms());
    tap(time.body, "onChange", "20");
    const effort = render("cook", 1, forms());
    tap(effort.body, "onPick", "minimal");
    for (const { calls } of [time, effort]) {
      expect(calls.setForm).toHaveBeenCalled();
      expect(calls.onNext).not.toHaveBeenCalled();
    }
  });

  it("E. a choice that reveals more controls (Cook's budget) waits for Continue", () => {
    const values = forms({ cook: { shopping: "can_buy" } });
    const { calls, body } = render("cook", 3, values);
    // The budget body is its own (stateful) component; what it reports on any
    // tap is a whole updated form through the screen's one onChange.
    (body as ReactElement<{ onChange: (v: CookForm) => void }>).props.onChange({ ...values.cook, budget_override_usd: 10 });
    expect(calls.setForm).toHaveBeenCalledWith("cook", expect.objectContaining({ budget_override_usd: 10 }));
    expect(calls.onNext).not.toHaveBeenCalled();
  });
});

describe("Back, and answers staying selected", () => {
  it("Back from a question returns to exactly the previous one", () => {
    let screen: Screen = { name: "questions", mode: "cook", step: 3, viaMode: false };
    screen = homeReducer(screen, { type: "back" });
    expect(screen).toMatchObject({ name: "questions", step: 2 });
    screen = homeReducer(screen, { type: "back" });
    expect(screen).toMatchObject({ step: 1 });
  });

  it("the previous answer is still selected when you come back to it", () => {
    const { body } = render("cook", 0, forms({ cook: { hunger: "very_hungry" } }));
    expect(find(body, "onPick")?.props.value).toBe("very_hungry");
    const eat = render("order", 3, forms({ order: { method: "pickup", meal_budget: "15_to_25" } }));
    expect(find(eat.body, "onPick")?.props.value).toBe("15_to_25");
  });

  it("a late auto-advance from a screen the user already left is ignored", () => {
    const screen: Screen = { name: "questions", mode: "cook", step: 2, viaMode: false }; // user pressed Continue past step 1
    expect(homeReducer(screen, { type: "next", stepCount: 5, from: 1 })).toBe(screen);
  });
});

describe("no double navigation (one pending move at a time)", () => {
  it("two quick taps run one move; Back or Continue in the beat cancels it", () => {
    vi.useFakeTimers();
    try {
      const scheduler = createAdvanceScheduler(220);
      const move = vi.fn();
      scheduler.schedule(move);
      scheduler.schedule(move);
      vi.advanceTimersByTime(300);
      expect(move).toHaveBeenCalledTimes(1);

      scheduler.schedule(move);
      scheduler.cancel();
      vi.advanceTimersByTime(300);
      expect(move).toHaveBeenCalledTimes(1);
      expect(scheduler.pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the move waits for the beat, so the tapped choice is visible first", () => {
    vi.useFakeTimers();
    try {
      const scheduler = createAdvanceScheduler(220);
      const move = vi.fn();
      scheduler.schedule(move);
      vi.advanceTimersByTime(219);
      expect(move).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2);
      expect(move).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
