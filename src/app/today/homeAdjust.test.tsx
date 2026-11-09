// @vitest-environment jsdom
//
// "Adjust" on the results screen, through the REAL HomeFlow — only the network and the server
// actions are stand-ins. The root cause this pins: the only way to change results was Change, which
// reopened the questions of the mode the results were IN, so a person who had asked for a snack
// and then wanted to cook a proper meal had to go back to Home and start again.
//
// Each test hands in what the reader (a model, in production) would return for the sentence in its
// title; what is checked is what the app then does with it.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateNutritionTargets } from "@/lib/nutrition";
import { DEFAULT_PROTEIN_TARGET_G } from "@/lib/options";
import { toProfileFormValues } from "@/lib/profile";
import { rememberedDefaults } from "@/lib/recommend/rememberedDefaults";
import { cookContext } from "@/test/cookFixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const choose = vi.fn(async (_id: string, index: 0 | 1 | 2) => ({ ok: true, chosenIndex: index }));
vi.mock("./actions", () => ({
  chooseRecommendation: (...args: [string, 0 | 1 | 2]) => choose(...args),
  rescoreSession: vi.fn(),
  dismissNutritionStep: vi.fn(),
}));
vi.mock("./events.actions", () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/location", () => ({ LocationError: class extends Error {}, requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })) }));

import HomeFlow from "./HomeFlow";
import { resetStore } from "./recommendStore";

type Call = { body: { context: Record<string, unknown>; entry?: string; previous_recommendations?: unknown[] }; respond: (status: number, json: unknown) => void };
type ReadCall = { body: { text: string; adjusting?: string }; respond: (json: unknown, status?: number) => void };
let container: HTMLDivElement;
let root: Root;
let recommendCalls: Call[];
let readCalls: ReadCall[];

const cards = (tag: string) => [
  { decision_mode: "order", role: "best_match", title: `${tag} bowl`, reason: "r", search_terms: ["x"], order_notes: "n", modification: null, watch: null, estimated_calories: 600, estimated_protein_g: 30 },
  { decision_mode: "order", role: "lowest_effort", title: `${tag} wrap`, reason: "r", search_terms: ["x"], order_notes: "n", modification: null, watch: null, estimated_calories: 500, estimated_protein_g: 20 },
  { decision_mode: "order", role: "alternative", title: `${tag} salad`, reason: "r", search_terms: ["x"], order_notes: "n", modification: null, watch: null, estimated_calories: 400, estimated_protein_g: 15 },
];
const reply = (tag: string) => ({ recommendations: cards(tag), insufficient_inventory: false, nutrition_is_estimate: true, constraints: {}, model: "m", session_id: `session-${tag}` });
const EMPTY_READ = { mode: null, hunger: null, minutes: null, effort: null, shopping: null, foods: [], extra_spend_usd: null, meal_budget: null, method: null, distance: null, craving: null, craving_category: null, snack_craving: null, ways: [], leave_to_us: null, after_exercise: null, protein_focus: null, meal_type: null, clear: [] };

beforeEach(() => {
  resetStore();
  choose.mockClear();
  recommendCalls = [];
  readCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/recommend/interpret")) {
        return new Promise((resolve) => readCalls.push({ body: JSON.parse(String(init?.body)), respond: (json, status = 200) => resolve(Response.json(status === 200 ? { interpretation: json } : { error: json }, { status })) }));
      }
      if (u.endsWith("/api/recommend")) {
        return new Promise((resolve) => recommendCalls.push({ body: JSON.parse(String(init?.body)), respond: (status, json) => resolve(Response.json(json, { status })) }));
      }
      return Promise.resolve(Response.json({ url: null }));
    }),
  );
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
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

// A returning user: real earlier answers for Cook (so a switch to Cook needs no questions).
const RETURNING = rememberedDefaults([cookContext({ cook_minutes: 30, effort: "some", shopping: "can_buy", budget_override_usd: 12 })]);

function mount(defaults = RETURNING) {
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
const text = () => container.textContent ?? "";
const button = (label: string | RegExp) =>
  [...container.querySelectorAll("button")].find((b) => {
    const names = [b.textContent?.trim() ?? "", b.getAttribute("aria-label") ?? ""];
    return names.some((n) => (typeof label === "string" ? n === label : label.test(n)));
  });
const click = (label: string | RegExp) => act(async () => { const b = button(label); if (!b) throw new Error(`no button ${label}`); b.click(); await new Promise((r) => setTimeout(r, 0)); });
const typeInto = (selector: string, value: string) =>
  act(async () => {
    const el = container.querySelector<HTMLTextAreaElement>(selector)!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const adjustBox = () => container.querySelector<HTMLTextAreaElement>("#adjust-text");

/** Start from a typed sentence the reader turns into `first`, and finish its request. */
async function startWith(first: Record<string, unknown>, tag = "first") {
  mount();
  await typeInto("#situation", "something small and sweet");
  await click("Help me decide");
  readCalls[0].respond({ ...EMPTY_READ, ...first });
  await flush();
  recommendCalls[0].respond(200, reply(tag));
  await flush();
}
/** Open Adjust, type, press Update, and let the reader answer. */
async function adjustWith(words: string, delta: Record<string, unknown>) {
  const before = readCalls.length;
  await click("Adjust");
  await typeInto("#adjust-text", words);
  await click("Update recommendations");
  readCalls[before].respond({ ...EMPTY_READ, ...delta });
  await flush();
}
const lastContext = () => recommendCalls[recommendCalls.length - 1].body.context;
const SNACK_READ = { mode: "store_snack", hunger: "light", snack_craving: "sweet", meal_type: "snack" };

describe("Snack → a proper meal I cook (no going back to Home)", () => {
  it("the request becomes Cook, keeps what still applies, and the new results replace the old", async () => {
    await startWith(SNACK_READ);
    expect(lastContext()).toMatchObject({ decision_mode: "store_snack", hunger: "light" });
    await adjustWith("No more snacks, I'll cook a proper meal.", { mode: "cook", ways: ["cook"], meal_type: "meal" });
    expect(readCalls[1].body.adjusting).toBe("store_snack"); // the reader is told the way, nothing else
    expect(recommendCalls).toHaveLength(2);
    expect(recommendCalls[1].body.entry).toBe("adjust");
    expect(lastContext()).toMatchObject({ decision_mode: "cook", hunger: "light", cook_minutes: 30, effort: "some", shopping: "can_buy" });
    recommendCalls[1].respond(200, reply("second"));
    await flush();
    expect(text()).toContain("second bowl");
    expect(text()).not.toContain("first bowl");
    await click(/View \/ edit/);
    expect(text()).toContain("You asked to change it");
    // …and the box is empty and closed once the change has produced results.
    expect(adjustBox()).toBeNull();
  });
});

describe("Cook → buy something ready-made (a proper meal)", () => {
  it("becomes an open, buying-only, meal-only request — it is not stuck in Cook", async () => {
    await startWith({ mode: "cook", hunger: "very_hungry", minutes: 20, effort: "some", shopping: "can_buy", extra_spend_usd: 15, foods: ["eggs"] });
    expect(lastContext()).toMatchObject({ decision_mode: "cook" });
    await adjustWith("I don't want to cook, buy something ready-made, a proper meal.", { ways: ["buy"], meal_type: "meal" });
    expect(lastContext()).toMatchObject({ decision_mode: "open", ways: { cook: false, buy: true }, meal_only: true, hunger: "very_hungry", minutes: null, ingredients_on_hand: [] });
  });
});

describe("Open → clearly no cooking", () => {
  it("keeps everything else and only changes the way", async () => {
    await startWith({ ways: ["cook", "buy"], hunger: "very_hungry", after_exercise: true, protein_focus: true });
    expect(lastContext()).toMatchObject({ decision_mode: "open", ways: { cook: true, buy: true } });
    await adjustWith("Not cooking tonight.", { ways: ["buy"] });
    expect(lastContext()).toMatchObject({ decision_mode: "open", ways: { cook: false, buy: true }, hunger: "very_hungry", after_exercise: true, protein_focus: true });
  });
});

describe("only the budget changes", () => {
  it("Cook: same time, effort, foods and hunger — only the money moves", async () => {
    await startWith({ mode: "cook", hunger: "very_hungry", minutes: 20, effort: "some", shopping: "can_buy", extra_spend_usd: 15, foods: ["eggs", "rice"], craving: "warm" });
    await adjustWith("Same, but the budget down to $10.", { extra_spend_usd: 10 });
    expect(lastContext()).toMatchObject({ decision_mode: "cook", budget_override_usd: 10, cook_minutes: 20, effort: "some", hunger: "very_hungry", ingredients_on_hand: ["eggs", "rice"], craving: "warm" });
  });

  it("a snack has no budget: nothing is sent, and the person is told why", async () => {
    await startWith(SNACK_READ);
    await adjustWith("Same, but $10.", { extra_spend_usd: 10 });
    expect(recommendCalls).toHaveLength(1); // no second request
    expect(text()).toMatch(/doesn't change anything/i);
    expect(adjustBox()?.value).toBe("Same, but $10."); // the text stays, editable
  });
});

describe("'Show me 3 more' does not touch the conditions", () => {
  it("sends the same context plus what was shown, with no read at all", async () => {
    await startWith({ mode: "cook", hunger: "normal", minutes: 20, effort: "some", shopping: "can_buy", extra_spend_usd: 15 });
    const first = lastContext();
    await click("Show me 3 more");
    expect(readCalls).toHaveLength(1); // only the first sentence was ever read
    expect(recommendCalls[1].body.context).toEqual(first);
    expect(recommendCalls[1].body.entry).toBe("more");
    expect(recommendCalls[1].body.previous_recommendations).toHaveLength(3);
  });
});

describe("one-tap changes: no model, no text", () => {
  it("'I'll cook it' switches way without reading anything", async () => {
    await startWith(SNACK_READ);
    await click("Adjust");
    await click("I'll cook it");
    expect(readCalls).toHaveLength(1);
    expect(lastContext()).toMatchObject({ decision_mode: "cook", hunger: "light" });
    expect(recommendCalls[1].body.entry).toBe("adjust");
  });
  it("the one-tap change to the way you are already in is not offered", async () => {
    await startWith(SNACK_READ);
    await click("Adjust");
    expect(button("Just a snack")).toBeUndefined();
    expect(button("I'll cook it")).toBeDefined();
  });
});

describe("a failed change keeps the text and the old results — and says whose they are", () => {
  it("the earlier results are labelled as the earlier request's; the words are still in the box; retrying works", async () => {
    await startWith(SNACK_READ);
    await adjustWith("I'll cook a proper meal.", { mode: "cook", ways: ["cook"], meal_type: "meal" });
    recommendCalls[1].respond(502, { error: { code: "upstream_timeout", message: "x" } });
    await flush();
    expect(text()).toContain("Your previous recommendations");
    expect(text()).toContain("first bowl");
    expect(adjustBox()?.value).toBe("I'll cook a proper meal."); // kept, panel reopened beside the old results
    // Update again: the model is read again, and a success replaces the old results and clears the box.
    await click("Update recommendations");
    readCalls[2].respond({ ...EMPTY_READ, mode: "cook", ways: ["cook"], meal_type: "meal" });
    await flush();
    recommendCalls[2].respond(200, reply("third"));
    await flush();
    expect(text()).toContain("third bowl");
    expect(text()).not.toContain("Your previous recommendations");
    expect(adjustBox()).toBeNull();
  });

  it("a read that fails (the reader is down) keeps the text, keeps the results, sends nothing", async () => {
    await startWith(SNACK_READ);
    await click("Adjust");
    await typeInto("#adjust-text", "make it a proper meal");
    await click("Update recommendations");
    readCalls[1].respond("unavailable", 502);
    await flush();
    expect(recommendCalls).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/text is still here/i);
    expect(adjustBox()?.value).toBe("make it a proper meal");
    expect(text()).toContain("first bowl");
  });
});

describe("one request at a time, and an old answer can't overwrite a newer situation", () => {
  it("Update is disabled while the change is being read, so a second press does not send a second read", async () => {
    await startWith(SNACK_READ);
    await click("Adjust");
    await typeInto("#adjust-text", "cook it");
    await click("Update recommendations");
    expect((button(/Updating/) as HTMLButtonElement | undefined)?.disabled).toBe(true);
    await click(/Updating/);
    expect(readCalls).toHaveLength(2); // first sentence + this one — not three
  });

  it("'Start over' while a change is being read: the late answer arrives to nothing", async () => {
    await startWith(SNACK_READ);
    await click("Adjust");
    await typeInto("#adjust-text", "cook it");
    await click("Update recommendations");
    await click("Start over");
    readCalls[1].respond({ ...EMPTY_READ, mode: "cook", ways: ["cook"] });
    await flush();
    expect(recommendCalls).toHaveLength(1);
    expect(container.querySelector("#situation")).not.toBeNull(); // back at the start, nothing sent
  });
});

describe("after a switch, the rest still works", () => {
  it("choosing a card records the NEW session; Adjust → edit opens the questions of the NEW way", async () => {
    await startWith(SNACK_READ);
    await click("Adjust");
    await click("I'll cook it");
    recommendCalls[1].respond(200, reply("second"));
    await flush();
    await click("Choose this");
    expect(choose).toHaveBeenCalledWith("session-second", 0);
    await click("Adjust");
    await click("Edit answers step by step");
    expect(container.querySelector("h1, h2")?.textContent).toMatch(/hungry/i); // Cook's first question, not the snack's
  });
});
