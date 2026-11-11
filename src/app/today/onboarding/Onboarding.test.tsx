// @vitest-environment jsdom
//
// First-run setup: two screens, hard constraints only. Allergies need an explicit
// answer to Continue — "No known food allergies" is one, skipping is another thing and
// stays "not set". Nothing about goals, body or soft preferences stands in the way.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_VALUES } from "@/lib/profile";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const completeOnboarding = vi.fn(async () => ({ ok: true as const }));
vi.mock("../actions", () => ({ completeOnboarding: (...a: unknown[]) => (completeOnboarding as (...x: unknown[]) => unknown)(...a) }));

import { ALLERGY_NOTE } from "@/lib/disclaimers";
import Onboarding from "./Onboarding";

let container: HTMLDivElement;
let root: Root;
const onDone = vi.fn();
const text = () => container.textContent ?? "";
const button = (label: string | RegExp) => [...container.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? "")));
const click = (label: string | RegExp) => act(async () => { const b = button(label); if (!b) throw new Error(`no button ${label}`); b.click(); await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  completeOnboarding.mockClear();
  onDone.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Onboarding initial={DEFAULT_FORM_VALUES} onDone={onDone} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("first-run setup", () => {
  it("says at the allergy question that checks can miss allergens", () => {
    expect(text()).toContain(ALLERGY_NOTE);
  });

  it("asks only about allergies and the dietary pattern — nothing else", async () => {
    expect(text()).toMatch(/Any food allergies/);
    await click(/^Skip for now/);
    expect(text()).toMatch(/particular diet/);
    expect(text()).not.toMatch(/goal|weight|height|age|calorie|protein|equipment|dislike/i);
  });

  it("Continue needs an answer; 'No known food allergies' is one", async () => {
    expect((button(/Choose an answer to continue/) as HTMLButtonElement).disabled).toBe(true);
    await click("No known food allergies");
    expect((button("Continue") as HTMLButtonElement).disabled).toBe(false);
  });

  it("'No known allergies' is saved as that answer", async () => {
    await click("No known food allergies");
    await click("Continue");
    await click("Skip");
    expect(completeOnboarding).toHaveBeenCalledWith(expect.objectContaining({ allergies: [] }), { noKnownAllergies: true });
    expect(onDone).toHaveBeenCalled();
  });

  it("skipping the allergy question saves NO answer — it stays 'not set'", async () => {
    await click(/^Skip for now/);
    await click("Skip");
    expect(completeOnboarding).toHaveBeenCalledWith(expect.anything(), { noKnownAllergies: false });
    expect(onDone).toHaveBeenCalled();
  });

  it("a failed save never traps the person", async () => {
    completeOnboarding.mockResolvedValueOnce({ ok: false, error: "nope" } as never);
    await click(/^Skip for now/);
    await click("Skip");
    expect(text()).toContain("nope");
    await click("Continue without saving");
    expect(onDone).toHaveBeenCalled();
  });
});
