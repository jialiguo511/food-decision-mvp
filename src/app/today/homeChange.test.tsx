// @vitest-environment jsdom
//
// "Change" on the results screen, through the REAL HomeFlow — only the network and
// the server actions are stand-ins. The rule: a decision that started from a typed
// sentence returns to that sentence (kept in memory only, editable, sent again like
// a new one); a decision from the questions returns to the questions; and editing
// ONE item in "What I understood" is a different, narrower action than Change.
//
// Root cause this pins: Change always opened the question flow, so a person who
// had typed a sentence was dropped into a questionnaire they had just avoided.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateNutritionTargets } from "@/lib/nutrition";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import { toProfileFormValues } from "@/lib/profile";
import { rememberedDefaults } from "@/lib/recommend/rememberedDefaults";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("./actions", () => ({
  chooseRecommendation: vi.fn(async (_id: string, index: 0 | 1 | 2) => ({ ok: true, chosenIndex: index })),
  rescoreSession: vi.fn(),
  dismissNutritionStep: vi.fn(),
}));
vi.mock("./events.actions", () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/location", () => ({ LocationError: class extends Error {}, requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })) }));

import HomeFlow from "./HomeFlow";
import { resetStore } from "./recommendStore";

type Deferred = { body: { context: Record<string, unknown> }; resolve: (json: unknown) => void };
let container: HTMLDivElement;
let root: Root;
let recommendCalls: Deferred[];
let nextRead: Record<string, unknown>;
let reads: number;

const ideas = (tag: string) => [
  { decision_mode: "order", role: "best_match", title: `${tag} bowl`, reason: "r", search_terms: ["x"], order_notes: "n", modification: null, watch: null, estimated_calories: 600, estimated_protein_g: 30 },
  { decision_mode: "order", role: "lowest_effort", title: `${tag} wrap`, reason: "r", search_terms: ["x"], order_notes: "n", modification: null, watch: null, estimated_calories: 500, estimated_protein_g: 20 },
  { decision_mode: "order", role: "alternative", title: `${tag} salad`, reason: "r", search_terms: ["x"], order_notes: "n", modification: null, watch: null, estimated_calories: 400, estimated_protein_g: 15 },
];
const reply = (tag: string) => ({ recommendations: ideas(tag), insufficient_inventory: false, nutrition_is_estimate: true, constraints: {}, model: "m", session_id: `session-${tag}` });
const EMPTY_READ = { mode: null, hunger: null, minutes: null, effort: null, shopping: null, foods: [], extra_spend_usd: null, meal_budget: null, method: null, distance: null, craving: null, craving_category: null, snack_craving: null, ways: [], leave_to_us: null, after_exercise: null, protein_focus: null };

beforeEach(() => {
  resetStore();
  recommendCalls = [];
  reads = 0;
  nextRead = { ...EMPTY_READ, mode: "order", method: "delivery", meal_budget: "under_15" };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/recommend/interpret")) {
        reads++;
        return Promise.resolve(Response.json({ interpretation: nextRead }));
      }
      if (u.endsWith("/api/recommend")) {
        return new Promise((resolve) => recommendCalls.push({ body: JSON.parse(String(init?.body)), resolve: (json) => resolve(Response.json(json)) }));
      }
      return Promise.resolve(Response.json({ url: null }));
    }),
  );
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ORDER_USED = rememberedDefaults([{ decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "delivery", meal_budget: "no_preference", travel_willingness: "no_preference" }]);

function mount(defaults = rememberedDefaults([])) {
  act(() =>
    root.render(
      <HomeFlow
        ownerId="u1"
        defaults={defaults}
        kitchenStaples={[]}
        equipmentKnown
        avoidsFoods={false}
        nutritionTargets={calculateNutritionTargets(toProfileFormValues(null), DEFAULT_PROTEIN_TARGET_G)}
        targetsSig={null}
        initialSession={null}
        initialChosenIndex={null}
        initialFeedback={null}
        initialPlaceFeedback={{}}
        onboardingProfile={null}
        nutritionProfile={null}
        allergyStatus="listed"
      />,
    ),
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const h1h2 = () => container.querySelector("h1, h2")?.textContent ?? "";
/** A button by its visible text or its accessible name (exact string, or a pattern). */
const button = (label: string | RegExp) =>
  [...container.querySelectorAll("button")].find((b) => {
    const names = [b.textContent?.trim() ?? "", b.getAttribute("aria-label") ?? ""];
    return names.some((n) => (typeof label === "string" ? n === label : label.test(n)));
  });
const click = (label: string | RegExp) => act(async () => { const b = button(label); if (!b) throw new Error(`no button ${label}`); b.click(); await new Promise((r) => setTimeout(r, 0)); });
/** "Change" used to be one button; it is now Adjust → the edit link inside the panel. */
const change = async () => {
  await click("Adjust");
  await click(/^Edit (my sentence|answers step by step)$/);
};
const box = () => container.querySelector<HTMLTextAreaElement>("#situation");
const type = (text: string) =>
  act(async () => {
    const el = box()!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const answer = async (tag: string, index = recommendCalls.length - 1) => {
  recommendCalls[index].resolve(reply(tag));
  await flush();
};
const send = async () => {
  await click("Help me decide");
  await flush();
};

describe("a decision that started from a typed sentence", () => {
  it("Change returns to the sentence box with the original text — it does NOT open the questions", async () => {
    mount();
    await type("Tired, order something around $15");
    await send();
    await answer("A");
    expect(container.querySelector('section[aria-label="What I understood"]')).not.toBeNull();

    await change();
    expect(h1h2()).toBe("What should I eat?");
    expect(box()?.value).toBe("Tired, order something around $15");
    expect(container.textContent).not.toContain("How are you getting food?");
  });

  it("the text can be edited and sent again, and the new decision replaces the old", async () => {
    mount();
    await type("Tired, order something around $15");
    await send();
    await answer("A");

    await change();
    nextRead = { ...EMPTY_READ, mode: "order", method: "delivery", meal_budget: "25_to_40" };
    await type("Tired, order something around $30");
    await send();
    expect(reads).toBe(2);
    expect(recommendCalls).toHaveLength(2);
    expect(recommendCalls[1].body.context).toMatchObject({ decision_mode: "order", meal_budget: "25_to_40" }); // the new words, not the old budget
    await answer("B");
    expect(container.textContent).toContain("B bowl");
    expect(container.textContent).not.toContain("A bowl");
    expect(box()).toBeNull(); // on the results screen again
  });

  it("an older answer arriving after the new one is sent cannot overwrite it", async () => {
    mount();
    await type("Tired, order something around $15");
    await send(); // request 0 is still running
    await change(); // back to the sentence, mid-request
    nextRead = { ...EMPTY_READ, mode: "order", method: "delivery", meal_budget: "25_to_40" };
    await type("Tired, order something around $30");
    await send(); // request 1 supersedes request 0
    await answer("NEW", 1);
    await answer("OLD", 0); // the abandoned request answers late
    expect(container.textContent).toContain("NEW bowl");
    expect(container.textContent).not.toContain("OLD bowl");
  });

  it("the person can still switch to the questions themselves — nothing forces them", async () => {
    mount(ORDER_USED);
    await type("Tired, order something around $15");
    await send();
    await answer("A");
    await change();
    expect(button(/^Get food/)).toBeDefined(); // the step-by-step path is right there
    await click(/^Get food/);
    expect(h1h2()).not.toBe("What should I eat?");
  });

  it("the sentence lives in this page's memory only: nothing stored, and the analytics events carry no text", async () => {
    const { trackEvent } = await import("./events.actions");
    mount();
    await type("secret-craving-xyz order something");
    await send();
    await answer("A");
    await change();
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toContain("secret-craving-xyz");
    expect(Object.keys(window.localStorage)).toEqual([]);
    expect(Object.keys(window.sessionStorage)).toEqual([]);
  });
});

describe("editing ONE item in 'What I understood' is not Change", () => {
  it("tapping a chip opens just that question", async () => {
    mount();
    await type("Tired, order something around $15");
    await send();
    await answer("A");
    await click(/View \/ edit/);
    await click("Edit: Under $15");
    expect(h1h2()).toBe("What's your budget?");
  });

  it("'Edit details' opens the questions from the first one", async () => {
    mount();
    await type("Tired, order something around $15");
    await send();
    await answer("A");
    await click(/View \/ edit/);
    await click("Edit details");
    expect(h1h2()).toBe("How are you getting food?");
  });

  it("the summary is collapsed by default, with an obvious way to open it", async () => {
    mount();
    await type("Tired, order something around $15");
    await send();
    await answer("A");
    const panel = container.querySelector('section[aria-label="What I understood"]');
    expect(panel?.textContent).toMatch(/View \/ edit/);
    expect(panel?.querySelector("li")).toBeNull(); // no chips until opened
    await click(/View \/ edit/);
    expect(container.querySelector('section[aria-label="What I understood"] li')).not.toBeNull();
  });
});

describe("a decision that started from the questions", () => {
  it("Change keeps the original behaviour: back into the questions, no sentence involved", async () => {
    mount(ORDER_USED);
    await click(/^Get food/);
    await click(/Find something to order/);
    await answer("S");
    expect(container.querySelector('section[aria-label="What I understood"]')).toBeNull();
    await change();
    expect(h1h2()).toBe("How are you getting food?");
    expect(box()).toBeNull();
  });

  it("a sentence decision that is then changed field by field becomes a step-by-step one", async () => {
    mount();
    await type("Tired, order something around $15");
    await send();
    await answer("A");
    await click(/View \/ edit/);
    await click("Edit details");
    // Walk the order questions to the end with the answers already filled in.
    for (let n = 0; n < 8 && !/Find something to order/.test(container.textContent ?? ""); n++) await click("Continue");
    await click(/Find something to order/);
    await answer("C");
    expect(container.querySelector('section[aria-label="What I understood"]')).toBeNull();
    await change();
    expect(box()).toBeNull(); // questions, not the old sentence
  });
});
