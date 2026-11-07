// "Change answers while the first request is still running" must never meet a
// dead button. The buttons that send a request used to be disabled while one was
// in flight, so someone who tapped Change, edited an answer and pressed the
// final button during the wait got a greyed-out control and no explanation —
// indistinguishable from a broken app. The request store already makes this
// safe on its own (the same submit is one request; a different one supersedes
// and aborts the old — recommendStore.test.ts, homeLifecycle.test.tsx), so the
// screens must not add a second, silent rule on top of it.

import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import Button from "@/components/ui/Button";
import { baseDefaults } from "@/lib/recommend/rememberedDefaults";
import { cookContext } from "@/test/cookFixtures";
import QuestionFlow from "./QuestionFlow";
import StartScreen, { ModeScreen } from "./StartScreen";
import { cookSteps, orderSteps, snackSteps } from "./steps";

type ButtonEl = ReactElement<{ disabled?: boolean; onClick?: () => void; children?: ReactNode }>;

/** Every <Button> in a rendered element tree. */
function buttons(node: ReactNode): ButtonEl[] {
  if (node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  const el = node as ReactElement<{ children?: ReactNode; footer?: ReactNode }>;
  if (!el.props) return [];
  const here = el.type === Button ? [el as unknown as ButtonEl] : [];
  return [...here, ...buttons(el.props.children), ...buttons(el.props.footer)];
}

const d = baseDefaults();
const forms = (order: Partial<typeof d.order> = {}) => ({ cook: { ...cookContext() }, order: { ...d.order, ...order }, store_snack: { ...d.store_snack } });

function lastQuestion(mode: "cook" | "order" | "store_snack", order: Partial<typeof d.order> = {}) {
  const f = forms(order);
  const count = mode === "cook" ? cookSteps(f.cook).length : mode === "order" ? orderSteps(f.order).length : snackSteps().length;
  return QuestionFlow({
    mode,
    step: count - 1,
    forms: f,
    setForm: vi.fn() as never,
    onNext: vi.fn() as never,
    onBack: () => {},
    onFinish: vi.fn() as never,
    onIdeasByType: () => {},
    budgetUsual: null,
    kitchenStaples: [],
  });
}

describe("the buttons that send a request are never disabled by a request in flight", () => {
  it.each([
    ["Make something", () => lastQuestion("cook")],
    ["Get food · by type (delivery)", () => lastQuestion("order", { method: "delivery" })],
    ["Get food · nearby (pickup)", () => lastQuestion("order", { method: "pickup" })],
    ["Grab a snack", () => lastQuestion("store_snack")],
  ])("%s: the final question's buttons are all enabled", (_name, render) => {
    const found = buttons(render());
    expect(found.length).toBeGreaterThan(0);
    for (const button of found) expect(button.props.disabled).toBeFalsy();
  });

  it("a mode's own screen: the one CTA is enabled", () => {
    const found = buttons(ModeScreen({ mode: "cook", summary: ["30 min"], cta: "Show me meals", onFind: vi.fn(), onEdit: vi.fn(), onBack: vi.fn() }));
    const cta = found.find((b) => b.props.children === "Show me meals");
    expect(cta).toBeDefined();
    expect(cta!.props.disabled).toBeFalsy();
  });

  it('Start: "Use again" is enabled', () => {
    const found = buttons(
      StartScreen({ lastTime: { mode: "cook", summary: ["30 min"] }, onUseAgain: vi.fn(), onPickMode: vi.fn() }),
    );
    const again = found.find((b) => b.props.children === "Use again");
    expect(again).toBeDefined();
    expect(again!.props.disabled).toBeFalsy();
  });
});
