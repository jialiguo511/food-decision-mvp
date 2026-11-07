// The question views: answering only ever updates form state — no question
// makes a request of its own (the only fetch lives in useRecommend.run,
// reached from the explicit final buttons) — and answers survive a detour.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseDefaults } from "@/lib/recommend/rememberedDefaults";
import { TRAVEL_OPTIONS } from "@/lib/options";
import { cookContext } from "@/test/cookFixtures";
import type { CookForm, OrderContext } from "@/lib/types";
import { cookQuestion } from "./cookQuestions";
import { orderQuestion } from "./eatOutQuestions";

type PickProps = { onPick: (v: string) => void; options: unknown };
const d = { ...baseDefaults(), cook: cookContext() };

afterEach(() => vi.unstubAllGlobals());

describe("Eat out questions", () => {
  it("switching to Delivery and back keeps the travel choice", () => {
    let current: OrderContext = { ...d.order, method: "pickup", travel_willingness: "walkable" };
    const set = (v: OrderContext) => void (current = v);
    const pickMethod = (m: string) =>
      (orderQuestion("method", { values: current, onChange: set, onPick: set }).body as ReactElement<PickProps>).props.onPick(m);

    pickMethod("delivery");
    expect(current).toMatchObject({ method: "delivery", travel_willingness: "walkable" });
    pickMethod("pickup");
    expect(current).toMatchObject({ method: "pickup", travel_willingness: "walkable" });
  });

  it("offers the four travel choices, without a numeric radius", () => {
    const body = orderQuestion("travel", { values: d.order, onChange: () => {}, onPick: () => {} }).body as ReactElement<PickProps>;
    expect(body.props.options).toBe(TRAVEL_OPTIONS);
    expect(JSON.stringify(TRAVEL_OPTIONS)).not.toMatch(/\d/);
  });

  it("answering only updates form state — no request, so no Places call", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const onChange = vi.fn();
    const onPick = vi.fn();
    (orderQuestion("travel", { values: d.order, onChange, onPick }).body as ReactElement<PickProps>).props.onPick("walkable");
    (orderQuestion("budget", { values: d.order, onChange, onPick }).body as ReactElement<PickProps>).props.onPick("under_15");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ travel_willingness: "walkable" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ meal_budget: "under_15" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("travel is the last Eat out question, so picking it never auto-advances into a search", () => {
    const onPick = vi.fn();
    (orderQuestion("travel", { values: d.order, onChange: () => {}, onPick }).body as ReactElement<PickProps>).props.onPick("nearby");
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("Cook questions", () => {
  it("picking a shopping mode by hand ends the 'fewest items' fallback", () => {
    const onChange = vi.fn();
    const values: CookForm = { ...d.cook, minimize_purchases: true };
    const q = cookQuestion("shopping", { values, onChange, budgetUsual: null, kitchenStaples: [] });
    (q.body as ReactElement<PickProps>).props.onPick("inventory_only");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shopping: "inventory_only", minimize_purchases: false }));
  });

  it("says today's foods aren't saved", () => {
    const q = cookQuestion("ingredients", { values: d.cook, onChange: () => {}, budgetUsual: null, kitchenStaples: [] });
    expect(q.hint).toMatch(/nothing is saved/i);
  });
});

describe("kitchen staples disclosure and 'Use what I have' copy", () => {
  const STAPLES = ["Salt", "Olive oil", "Soy sauce"];
  const html = (step: "budget" | "ingredients", values: CookForm) =>
    renderToStaticMarkup(
      cookQuestion(step, { values, onChange: () => {}, budgetUsual: null, kitchenStaples: STAPLES }).body as ReactElement,
    );
  const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it("'I can buy a few things' shows the staples even with the foods picker collapsed", () => {
    const out = html("budget", { ...d.cook, shopping: "can_buy", ingredients_on_hand: [] });
    expect(out).toContain("Salt · Olive oil · Soy sauce");
    expect(out).not.toContain("Add another food");
  });

  it("lists them once, not again when the foods picker is open", () => {
    const out = html("budget", { ...d.cook, shopping: "can_buy", ingredients_on_hand: ["Eggs"] });
    expect(out).toContain("Add another food");
    expect(count(out, "Salt · Olive oil · Soy sauce")).toBe(1);
  });

  it("the foods step lists them once too", () => {
    expect(count(html("ingredients", { ...d.cook, shopping: "inventory_only" }), "Salt · Olive oil · Soy sauce")).toBe(1);
  });

  it("shows nothing about staples when the user has none", () => {
    const q = cookQuestion("budget", { values: d.cook, onChange: () => {}, budgetUsual: null, kitchenStaples: [] });
    expect(renderToStaticMarkup(q.body as ReactElement)).not.toContain("kitchen staples");
  });

  it("'Use what I have' says suggestions use only today's foods plus kitchen staples, with nothing to buy", () => {
    const q = cookQuestion("ingredients", { values: { ...d.cook, shopping: "inventory_only" }, onChange: () => {}, budgetUsual: null, kitchenStaples: [] });
    expect(q.hint).toMatch(/only suggest meals from what you add here and your kitchen staples/i);
    expect(q.hint).toMatch(/nothing to buy/i);
    expect(q.hint).toMatch(/nothing is saved/i);
  });
});

describe("Cook budget question never invents a usual", () => {
  const html = (values: CookForm, budgetUsual: Parameters<typeof cookQuestion>[1]["budgetUsual"]) =>
    renderToStaticMarkup(cookQuestion("budget", { values, onChange: () => {}, budgetUsual, kitchenStaples: [] }).body as ReactElement);
  const unanswered: CookForm = { ...cookContext(), budget_override_usd: null };

  it("a new user gets plain choices — no 'My usual', no 'Last time', no $12, nothing selected", () => {
    const out = html(unanswered, null);
    expect(out).not.toMatch(/usual|last time|different tonight/i);
    expect(out).not.toContain("$12");
    expect(out).toContain("About $10");
    expect(out).not.toContain('aria-checked="true"');
  });

  it("is not ready until a budget is chosen", () => {
    const q = cookQuestion("budget", { values: unanswered, onChange: () => {}, budgetUsual: null, kitchenStaples: [] });
    expect(q.ready).toBe(false);
    expect(cookQuestion("budget", { values: { ...unanswered, budget_override_usd: 10 }, onChange: () => {}, budgetUsual: null, kitchenStaples: [] }).ready).toBe(true);
  });

  it("a budget the user set in Me is offered back as 'My usual'", () => {
    const out = html({ ...unanswered, budget_override_usd: 15 }, { value: 15, source: "profile" });
    expect(out).toContain("My usual");
    expect(out).toContain("About $15");
    expect(out).toContain("Different tonight");
  });

  it("one from a real earlier session is called 'Last time', never 'My usual'", () => {
    const out = html({ ...unanswered, budget_override_usd: 8 }, { value: 8, source: "last_time" });
    expect(out).toContain("Last time");
    expect(out).not.toContain("My usual");
  });

  it("time and effort start unselected for a new user and gate Continue", () => {
    const q = cookQuestion("time_effort", { values: { ...cookContext(), cook_minutes: null, effort: null }, onChange: () => {}, budgetUsual: null, kitchenStaples: [] });
    expect(q.ready).toBe(false);
    expect(renderToStaticMarkup(q.body as ReactElement)).not.toContain('aria-pressed="true"');
    expect(renderToStaticMarkup(q.body as ReactElement)).not.toContain('aria-checked="true"');
  });
});
