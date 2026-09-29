// Home's Eat out form: which questions appear, and that changing a chip is only
// ever a state update — the form makes no network request of its own (the only
// fetch lives in useRecommend.run, reached from the explicit action buttons).

import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MEAL_BUDGETS, TRAVEL_OPTIONS } from "@/lib/options";
import type { OrderContext } from "@/lib/types";
import OrderForm from "./OrderForm";

const values = (o: Partial<OrderContext> = {}): OrderContext => ({
  decision_mode: "order",
  hunger: "normal",
  craving_category: "no_preference",
  craving_note: null,
  method: "eat_nearby",
  meal_budget: "no_preference",
  travel_willingness: "no_preference",
  ...o,
});

type Props = { title?: string; options?: unknown; onChange?: (v: string) => void; children?: ReactNode };

function walk(node: ReactNode, visit: (el: ReactElement<Props>) => void) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node && typeof node === "object" && "props" in node) {
    const el = node as ReactElement<Props>;
    visit(el);
    walk(el.props.children, visit);
  }
}
const cards = (tree: ReactNode) => {
  const titles: string[] = [];
  walk(tree, (el) => el.props.title && titles.push(el.props.title));
  return titles;
};
const chips = (tree: ReactNode, options: unknown) => {
  let found: ReactElement<Props> | null = null;
  walk(tree, (el) => {
    if (el.props.options === options) found = el;
  });
  return found as ReactElement<Props> | null;
};

afterEach(() => vi.unstubAllGlobals());

describe("OrderForm", () => {
  it("asks 'How far would you go?' only for Eat nearby", () => {
    expect(cards(OrderForm({ values: values({ method: "eat_nearby" }), onChange: () => {} }))).toContain("How far would you go?");
    for (const method of ["delivery", "pickup"] as const) {
      expect(cards(OrderForm({ values: values({ method }), onChange: () => {} }))).not.toContain("How far would you go?");
    }
  });

  it("offers the four travel choices in order, without a numeric radius", () => {
    expect(TRAVEL_OPTIONS.map((o) => o.label)).toEqual(["Walkable", "Nearby", "Worth a trip", "No strong preference"]);
    expect(JSON.stringify(TRAVEL_OPTIONS)).not.toMatch(/\d/);
  });

  it("changing a chip only updates form state — no request, so no Places call", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const onChange = vi.fn();
    const tree = OrderForm({ values: values(), onChange });

    chips(tree, TRAVEL_OPTIONS)!.props.onChange!("walkable");
    chips(tree, MEAL_BUDGETS)!.props.onChange!("under_15");

    expect(onChange).toHaveBeenNthCalledWith(1, expect.objectContaining({ travel_willingness: "walkable" }));
    expect(onChange).toHaveBeenNthCalledWith(2, expect.objectContaining({ meal_budget: "under_15" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
