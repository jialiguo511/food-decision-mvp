// @vitest-environment jsdom
//
// The sentence that used to dead-end in "What kind of help?": when the person doesn't
// pick ONE way to eat, the app makes ONE cross-way request and shows up to three cards
// that may be a recipe, something to order and something to grab. Through the REAL
// HomeFlow and request store — only the network and server actions are stand-ins.

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
  confirmNoAllergies: vi.fn(async () => ({ ok: true })),
}));
vi.mock("./events.actions", () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock("../saved/actions", () => ({ saveFromSession: vi.fn(async () => ({ ok: true })), unsaveFromSession: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/location", () => ({ LocationError: class extends Error {}, requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })) }));

import HomeFlow from "./HomeFlow";
import { chooseRecommendation } from "./actions";
import { resetStore } from "./recommendStore";
import { resetImageStore } from "./imageStore";

let container: HTMLDivElement;
let root: Root;
let recommendBodies: { context: Record<string, unknown> }[];
let read: Record<string, unknown>;
let imageCalls: { index: number; session_id: string }[];
/** What /api/image answers for each card index (default: nothing to show). */
let imageAnswer: (index: number) => Response;

const EMPTY: Record<string, unknown> = { mode: null, hunger: null, minutes: null, effort: null, shopping: null, foods: [], extra_spend_usd: null, meal_budget: null, method: null, distance: null, craving: null, craving_category: null, snack_craving: null, ways: [], leave_to_us: null, after_exercise: null, protein_focus: null };
const MIXED = [
  { decision_mode: "cook", role: "best_match", title: "Tuna wrap", reason: "Quick.", estimated_minutes: 10, estimated_meal_cost_usd: 4, estimated_extra_cost_usd: 4, estimated_calories: 400, estimated_protein_g: 30, watch: null, ingredients_on_hand: [], ingredients_needed: ["tuna", "tortilla"], equipment: [], steps: ["Wrap it."], inventory_note: null, image_query: null },
  { decision_mode: "store_snack", role: "lowest_effort", title: "Greek yogurt cup", reason: "Easy.", what_to_look_for: "Plain Greek yogurt.", backup: null, watch: null, estimated_calories: 150, estimated_protein_g: 15 },
  { decision_mode: "order", role: "alternative", title: "Chicken rice bowl", reason: "Filling.", search_terms: ["chicken bowl"], order_notes: "Extra chicken.", modification: null, watch: null, estimated_calories: 600, estimated_protein_g: 40 },
];
const reply = { recommendations: MIXED, insufficient_inventory: false, nutrition_is_estimate: true, constraints: {}, model: "m", session_id: "session-open" };

beforeEach(() => {
  resetStore();
  resetImageStore();
  imageCalls = [];
  imageAnswer = () => Response.json({ url: null, reason: "no_image" });
  recommendBodies = [];
  read = { ...EMPTY };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/recommend/interpret")) return Response.json({ interpretation: read });
      if (u.endsWith("/api/recommend")) {
        recommendBodies.push(JSON.parse(String(init?.body)));
        return Response.json(reply);
      }
      if (u.endsWith("/api/image")) {
        const body = JSON.parse(String(init?.body));
        imageCalls.push(body);
        return imageAnswer(body.index);
      }
      return Response.json({ url: null });
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

function mount(allergyStatus: "listed" | "none_known" | "not_set" = "listed") {
  act(() =>
    root.render(
      <HomeFlow
        ownerId="u1"
        defaults={rememberedDefaults([])}
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
        allergyStatus={allergyStatus}
      />,
    ),
  );
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const text = () => container.textContent ?? "";
const button = (label: string | RegExp) => [...container.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? "")));
const click = (label: string | RegExp) => act(async () => { const b = button(label); if (!b) throw new Error(`no button ${label}`); b.click(); await new Promise((r) => setTimeout(r, 0)); });
const type = (value: string) => act(async () => {
  const el = container.querySelector<HTMLTextAreaElement>("#situation")!;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
const say = async (sentence: string, reading: Record<string, unknown>) => {
  read = { ...EMPTY, ...reading };
  await type(sentence);
  await click("Help me decide");
  await flush();
  await flush();
};
const ctx = () => recommendBodies[0].context;

describe("not one way, and not unclear: straight to one cross-way request", () => {
  it("'protein after a half marathon, not very hungry, can buy or make' → no 'what kind of help' question", async () => {
    mount();
    await say("I didn't have enough protein after half marathon, but I'm not very hungry now. I can buy things or I can make something myself.", {
      hunger: "light", ways: ["cook", "buy"], after_exercise: true, protein_focus: true,
    });
    expect(text()).not.toMatch(/What kind of help|couldn't tell/i);
    expect(recommendBodies).toHaveLength(1); // ONE call, not one per mode
    expect(ctx()).toMatchObject({ decision_mode: "open", hunger: "light", ways: { cook: true, buy: true }, after_exercise: true, protein_focus: true });
    // nothing the person didn't say became a condition
    expect(ctx()).toMatchObject({ minutes: null, effort: null, extra_spend_usd: null, ingredients_on_hand: [] });
    // a mixed set, each card shown for what it is
    expect(text()).toContain("Tuna wrap");
    expect(text()).toContain("Greek yogurt cup");
    expect(text()).toContain("Chicken rice bowl");
  });

  it("the understanding shows what was said and does not claim a protein gap", async () => {
    mount();
    await say("protein after a run, not hungry, buy or make", { hunger: "light", ways: ["cook", "buy"], after_exercise: true, protein_focus: true });
    await click(/View \/ edit/);
    const panel = container.querySelector('section[aria-label="What I understood"]')?.textContent ?? "";
    expect(panel).toMatch(/protein/i);
    expect(panel).not.toMatch(/deficit|short of|missing protein|\d+\s?g/i);
  });

  it("'买或做都行，帮我决定。' → leave it to us", async () => {
    mount();
    await say("买或做都行，帮我决定。", { ways: ["cook", "buy"], leave_to_us: true });
    expect(recommendBodies).toHaveLength(1);
    expect(ctx()).toMatchObject({ decision_mode: "open", ways: { cook: true, buy: true } });
  });

  it("'不想做饭。' → buying only: the request itself rules cooking out", async () => {
    mount();
    await say("不想做饭。", { ways: ["buy"] });
    expect(ctx()).toMatchObject({ decision_mode: "open", ways: { cook: false, buy: true } });
  });

  it("'随便吃点。' → the low-burden path: one request, no questionnaire", async () => {
    mount();
    await say("随便吃点。", { leave_to_us: true });
    expect(text()).not.toMatch(/How are you getting food|How hungry|What kind of help/i);
    expect(recommendBodies).toHaveLength(1);
    expect(ctx()).toMatchObject({ decision_mode: "open", easy_pick: true });
  });
});

describe("a single explicit way is still honoured", () => {
  it("'只能用家里的鸡蛋和米饭。' → Cook with ONLY those foods (no cross-way request)", async () => {
    mount();
    await say("只能用家里的鸡蛋和米饭。", { mode: "cook", shopping: "inventory_only", foods: ["eggs", "rice"] });
    // Cooking genuinely needs a time and an effort level, so those are asked — and only those:
    // not the kind of help, not the foods (already said), not hunger.
    expect(recommendBodies).toHaveLength(0);
    expect(text()).toMatch(/Time and effort/);
    expect(text()).not.toMatch(/What kind of help|What do you have|How hungry/i);
    await click(/^30 min/);
    await click(/One pan is fine/);
    await click(/Show me meals/);
    await flush();
    expect(ctx()).toMatchObject({ decision_mode: "cook", shopping: "inventory_only", ingredients_on_hand: ["eggs", "rice"] });
    expect(JSON.stringify(ctx())).toContain("30"); // the time they picked
  });
});

describe("a cross-way set is a normal set", () => {
  it("choosing a card records which card, and nothing else changes", async () => {
    mount();
    await say("buy or make", { ways: ["cook", "buy"], leave_to_us: true });
    const choose = [...container.querySelectorAll("button")].filter((b) => /^(Choose|Pick|I('| )ll)/i.test(b.textContent?.trim() ?? ""));
    expect(choose.length).toBeGreaterThan(0);
    await act(async () => { choose[0].click(); await new Promise((r) => setTimeout(r, 0)); });
    expect(chooseRecommendation).toHaveBeenCalledWith("session-open", expect.any(Number));
  });
});

describe("allergies not set yet", () => {
  it("results carry a quiet, non-blocking note — we do not pretend to know", async () => {
    mount("not_set");
    await say("随便吃点", { leave_to_us: true });
    expect(text()).toContain("Greek yogurt cup"); // not blocked
    expect(text()).toMatch(/don't know about any food allergies/i);
    expect(button("No known allergies")).toBeDefined();
  });

  it("a person who answered sees no note", async () => {
    mount("none_known");
    await say("随便吃点", { leave_to_us: true });
    expect(text()).not.toMatch(/allergies yet/i);
  });
});

describe("pictures in a mixed set", () => {
  const photo = (n: number) => Response.json({ source: "photo", url: `https://img/${n}.jpg`, photographerName: "Pat", photographerUrl: "https://p/pat", sourceUrl: "https://p/photo" });
  const states = () => [...container.querySelectorAll("figure[data-image-state]")].map((f) => f.getAttribute("data-image-state"));
  const frames = () => [...container.querySelectorAll("figure[data-image-state] > div")].map((d) => /aspect-\S+/.exec(d.className)?.[0]);

  it("every card — recipe, snack, order — asks for its own picture once, and each shows what it got", async () => {
    imageAnswer = (i) => (i === 0 ? photo(0) : i === 1 ? Response.json({ url: null, reason: "no_image" }) : Response.json({ error: "x" }, { status: 502 }));
    mount();
    await say("buy or make", { ways: ["cook", "buy"], leave_to_us: true });
    await flush();
    expect(imageCalls.map((c) => c.index).sort()).toEqual([0, 1, 2]); // one request each, never a place lookup
    expect(imageCalls.every((c) => c.session_id === "session-open")).toBe(true);
    expect(states()).toEqual(["ready", "none", "failed"]);
  });

  it("a photo is labelled illustrative and credited; all three frames are the same shape", async () => {
    imageAnswer = (i) => (i === 2 ? photo(2) : Response.json({ url: null, reason: "no_image" }));
    mount();
    await say("buy or make", { ways: ["cook", "buy"], leave_to_us: true });
    await flush();
    const captions = [...container.querySelectorAll("figcaption")].map((c) => c.textContent);
    expect(captions[2]).toMatch(/Illustrative photo/);
    expect(captions[2]).toMatch(/Photo by Pat on Pexels/);
    expect(new Set(frames()).size).toBe(1); // same aspect ratio in every state and card type
    expect(captions[0]).not.toMatch(/Illustrative/); // nothing claimed when there is no photo
  });

  it("a failed picture can be retried — one more request, for that card only", async () => {
    imageAnswer = (i) => (i === 2 ? Response.json({ error: "x" }, { status: 502 }) : Response.json({ url: null, reason: "no_image" }));
    mount();
    await say("buy or make", { ways: ["cook", "buy"], leave_to_us: true });
    await flush();
    imageAnswer = () => photo(2);
    await click("Try again");
    await flush();
    expect(imageCalls.filter((c) => c.index === 2)).toHaveLength(2);
    expect(imageCalls.filter((c) => c.index !== 2)).toHaveLength(2);
    expect(states()).toEqual(["none", "none", "ready"]);
  });

  it("a request for no ready-made picture never delays the cards: they are on screen before any picture answers", async () => {
    let release: (r: Response) => void = () => {};
    imageAnswer = () => new Response("");
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => (String(url).endsWith("/api/image") ? new Promise<Response>((r) => (release = r)) : real(url, init))));
    mount();
    await say("buy or make", { ways: ["cook", "buy"], leave_to_us: true });
    expect(text()).toContain("Tuna wrap");
    expect(text()).toContain("Greek yogurt cup");
    expect(states()).toContain("loading");
    release(Response.json({ url: null, reason: "no_image" }));
  });
});
