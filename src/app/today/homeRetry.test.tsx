// @vitest-environment jsdom
//
// A failed request and the results that follow it, through the REAL HomeFlow and
// the real request store — only the network and the server actions are stand-ins.
// What must hold: a failure never lingers next to a newer success; a failure that
// keeps older results on screen says plainly that they are the PREVIOUS ones; an
// older request can never overwrite a newer one; and a picture that fails to load
// is a picture problem, not a failed recommendation.

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
vi.mock("../saved/actions", () => ({ saveFromSession: vi.fn(async () => ({ ok: true })), unsaveFromSession: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/location", () => ({ LocationError: class extends Error {}, requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })) }));

import HomeFlow from "./HomeFlow";
import { resetStore } from "./recommendStore";

type Call = { body: { context: Record<string, unknown> }; respond: (status: number, json: unknown) => void; respondText: (status: number, text: string) => void; dropConnection: () => void };
let container: HTMLDivElement;
let root: Root;
let calls: Call[];
let imageResponse: () => Response;

const idea = (title: string, role: string) => ({ decision_mode: "order", role, title, reason: "r", search_terms: ["x"], order_notes: "n", modification: null, watch: null, estimated_calories: 600, estimated_protein_g: 30 });
const recipe = (title: string, role: string) => ({ decision_mode: "cook", role, title, reason: "r", estimated_minutes: 15, estimated_meal_cost_usd: 4, estimated_extra_cost_usd: 0, estimated_calories: 500, estimated_protein_g: 30, watch: null, ingredients_on_hand: ["eggs"], ingredients_needed: [], equipment: ["pan"], steps: ["Cook."], inventory_note: null, image_query: null });
const cards = (tag: string) => ({ recommendations: [idea(`${tag} bowl`, "best_match"), idea(`${tag} wrap`, "lowest_effort"), idea(`${tag} salad`, "alternative")], insufficient_inventory: false, nutrition_is_estimate: true, constraints: {}, model: "m", session_id: `session-${tag}` });
const cookCards = (tag: string) => ({ ...cards(tag), recommendations: [recipe(`${tag} rice`, "best_match"), recipe(`${tag} eggs`, "lowest_effort"), recipe(`${tag} soup`, "alternative")] });
const failure = (code: string) => ({ error: { code, message: "internal detail that must never be shown" } });

beforeEach(() => {
  resetStore();
  calls = [];
  imageResponse = () => Response.json({ url: null, reason: "no_image" });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/api/recommend")) {
        return new Promise((resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          calls.push({
            body: JSON.parse(String(init?.body)),
            respond: (status, json) => resolve(new Response(JSON.stringify(json), { status })),
            respondText: (status, text) => resolve(new Response(text, { status, headers: { "Content-Type": "text/html" } })),
            dropConnection: () => reject(new TypeError("Failed to fetch")),
          });
        });
      }
      if (u.endsWith("/api/image")) return Promise.resolve(imageResponse());
      return Promise.resolve(Response.json({}));
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

const USED = rememberedDefaults([{ decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "delivery", meal_budget: "no_preference", travel_willingness: "no_preference" }]);

function mount() {
  act(() =>
    root.render(
      <HomeFlow
        ownerId="u1"
        defaults={USED}
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
const alerts = () => [...container.querySelectorAll('[role="alert"]')].map((a) => a.textContent ?? "");
const button = (label: string | RegExp) =>
  [...container.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent?.trim() === label : label.test(b.textContent ?? "")));
const click = async (label: string | RegExp) => {
  await act(async () => { const b = button(label); if (!b) throw new Error(`no button ${label}`); b.click(); await new Promise((r) => setTimeout(r, 0)); });
};
const answer = async (index: number, status: number, json: unknown) => {
  calls[index].respond(status, json);
  await flush();
  await flush();
};
const option = (label: RegExp) => [...container.querySelectorAll("button,[role=radio]")].find((b) => label.test(b.textContent ?? ""));
/** From the results: Change → through the questions as they are → send again (the SAME answers). */
const resend = async () => {
  await click("Change");
  for (let n = 0; n < 8 && !button(/Find something to order/); n++) await click("Continue");
  await click(/Find something to order/);
};
/** Same, but with one answer changed, so it is a DIFFERENT request from the one before. */
const resendDifferent = async () => {
  await click("Change");
  await click("Continue"); // → hunger
  await act(async () => { (option(/Starving/) as HTMLElement | undefined)?.click(); await new Promise((r) => setTimeout(r, 0)); });
  for (let n = 0; n < 8 && !button(/Find something to order/); n++) await click("Continue");
  await click(/Find something to order/);
};
/** Home → "Get food" (a mode with a remembered answer) → its one button. */
const generate = async () => {
  if (!button(/Find something to order/)) await click(/^Get food/);
  await click(/Find something to order/);
};

describe("a failure never lingers next to a newer success", () => {
  it("first request fails → 'Try again' → it works: the failure is gone and only the new cards show", async () => {
    mount();
    await generate();
    await answer(0, 502, failure("upstream_error"));
    expect(alerts()).toHaveLength(1);
    expect(text()).not.toContain("bowl");

    await click("Try again");
    expect(alerts()).toEqual([]); // cleared the moment the retry starts
    await answer(1, 200, cards("NEW"));
    expect(alerts()).toEqual([]);
    expect(text()).toContain("NEW bowl");
    expect(text()).not.toMatch(/previous recommendations|Couldn't|went wrong|usually works/i);
  });

  it("a fresh send of the same answers after a failure behaves the same", async () => {
    mount();
    await generate();
    await answer(0, 500, failure("malformed_output"));
    await resend();
    expect(alerts()).toEqual([]);
    await answer(1, 200, cards("OK"));
    expect(alerts()).toEqual([]);
    expect(text()).toContain("OK bowl");
  });

  it("failure → success → another failure: the second failure is about the second request only", async () => {
    mount();
    await generate();
    await answer(0, 500, failure("upstream_error"));
    await click("Try again");
    await answer(1, 200, cards("GOOD"));
    await resendDifferent();
    await answer(2, 504, failure("upstream_timeout"));
    expect(alerts().join(" ")).toMatch(/too long/i);
    expect(text()).toMatch(/Your previous recommendations/);
    expect(text()).toContain("GOOD bowl");
  });
});

describe("a rejected set says which of your rules it broke", () => {
  it("names the rule(s) in plain words, beside the reference", async () => {
    mount();
    await generate();
    await answer(0, 502, { error: { code: "constraint_violation", message: "internal", reasons: ["allergy", "no_cook"] } });
    expect(alerts().join(" ")).toMatch(/It broke: an allergy you listed; heat or cooking/);
    expect(alerts().join(" ")).not.toMatch(/internal/);
  });
  it("without reasons it just doesn't claim any", async () => {
    mount();
    await generate();
    await answer(0, 502, failure("constraint_violation"));
    expect(alerts().join(" ")).not.toMatch(/It broke/);
  });
});

describe("an older request can't overwrite a newer one", () => {
  it("the old one fails LATE, after the new one succeeded: no error appears", async () => {
    mount();
    await generate(); // request 0 is still running
    await resendDifferent(); // a different question: supersedes (aborts) request 0
    expect(calls).toHaveLength(2);
    await answer(1, 200, cards("NEWEST"));
    calls[0].respond(500, failure("upstream_timeout")); // arrives late
    await flush();
    expect(alerts()).toEqual([]);
    expect(text()).toContain("NEWEST bowl");
  });

  it("the old one SUCCEEDS late, after the new one: the newer cards stay", async () => {
    mount();
    await generate();
    await resendDifferent();
    expect(calls).toHaveLength(2);
    await answer(1, 200, cards("NEW"));
    calls[0].respond(200, cards("OLD"));
    await flush();
    expect(text()).toContain("NEW bowl");
    expect(text()).not.toContain("OLD bowl");
  });

  it("the new one fails while the old is still running: the old one's late success can't hide the failure", async () => {
    mount();
    await generate();
    await resendDifferent();
    await answer(1, 502, failure("upstream_error"));
    calls[0].respond(200, cards("OLD"));
    await flush();
    expect(alerts()).toHaveLength(1);
    expect(text()).not.toContain("OLD bowl"); // a superseded request never shows anything
  });
});

describe("older results kept under a failure are labelled as the PREVIOUS ones", () => {
  it("says so in the heading, names the earlier answers, shows the real reason, and offers only what makes sense", async () => {
    mount();
    await generate();
    await answer(0, 200, cards("FIRST"));
    expect(text()).toContain("Here's what to get");

    await resendDifferent();
    await answer(1, 504, failure("upstream_timeout"));

    expect(alerts().join(" ")).toMatch(/too long/i);
    expect(text()).toContain("Your previous recommendations");
    expect(container.querySelector('[data-testid="previous-note"]')?.textContent).toMatch(/earlier request.*not the one that just failed/i);
    expect(text()).toContain("FIRST bowl"); // still there to use…
    expect(text()).not.toContain("Here's what to get"); // …but not dressed as this request's result
    expect(button("Show me 3 more")).toBeUndefined(); // would act on the OLD answers
    expect(button("Try again")).toBeDefined();
  });

  it("clears the label the moment a retry starts, and is gone once it succeeds", async () => {
    mount();
    await generate();
    await answer(0, 200, cards("FIRST"));
    await resendDifferent();
    await answer(1, 500, failure("upstream_error"));
    expect(text()).toContain("Your previous recommendations");
    await click("Try again");
    expect(text()).not.toContain("Your previous recommendations"); // loading, not a mix
    await answer(2, 200, cards("SECOND"));
    expect(text()).not.toMatch(/previous recommendations/i);
    expect(text()).toContain("SECOND bowl");
    expect(text()).not.toContain("FIRST bowl");
  });
});

describe("the message matches the real cause", () => {
  const messageFor = async (code: string, status = 502) => {
    mount();
    await generate();
    await answer(0, status, failure(code));
    return alerts().join(" ");
  };
  it.each([
    ["upstream_timeout", /too long|timed out/i],
    ["constraint_violation", /passed your rules|never shown|allerg/i],
    ["session_save_failed", /couldn't be saved|stored/i],
    ["profile_unavailable", /food profile/i],
    ["malformed_output", /form we couldn't use|checked/i],
    ["truncated_output", /cut off/i],
    ["model_refused", /declined/i],
    ["upstream_error", /AI service didn't answer|usable response/i],
    ["rate_limited", /busy|slow down/i],
  ])("%s says something about THAT cause", async (code, expected) => {
    expect(await messageFor(code)).toMatch(expected);
  });

  it("none of them is called 'couldn't find good options', promises a second try works, or shows an internal detail", async () => {
    for (const code of ["upstream_error", "malformed_output", "constraint_violation", "truncated_output", "model_refused", "upstream_timeout", "session_save_failed", "profile_unavailable", "rate_limited", "some_future_code"]) {
      act(() => root.unmount());
      resetStore();
      root = createRoot(container);
      calls = [];
      const message = await messageFor(code);
      expect(message, code).not.toMatch(/good options|usually works|second go|it usually/i);
      expect(message, code).not.toContain("internal detail");
    }
  });

  it("does not loosen a rule to get a result: a rejected set offers a retry or changing answers, never 'ignore my allergies'", async () => {
    await messageFor("constraint_violation");
    expect(text()).not.toMatch(/ignore|skip|relax|anyway/i);
    expect(text()).toMatch(/don't loosen those rules/i);
  });

  it("shows a reference (the request id and the code) so a failure can be looked up in the logs", async () => {
    await messageFor("upstream_timeout");
    const reference = container.querySelector('[data-testid="error-reference"]')?.textContent ?? "";
    expect(reference).toMatch(/Reference [A-Za-z0-9_-]{6,} · upstream_timeout/);
  });
});

describe("a reply that isn't the app's own is described by what it was", () => {
  it("a gateway timeout page (HTML, 504) is 'took too long' — not 'the AI failed', not a JSON parse error", async () => {
    mount();
    await generate();
    calls[0].respondText(504, "<html>An error occurred with your deployment FUNCTION_INVOCATION_TIMEOUT</html>");
    await flush();
    await flush();
    expect(alerts().join(" ")).toMatch(/too long|timed out/i);
    expect(alerts().join(" ")).not.toMatch(/Unexpected token|JSON|FUNCTION_INVOCATION/);
    expect(container.querySelector('[data-testid="error-reference"]')?.textContent).toContain("upstream_timeout");
  });

  it("any other HTML error page is 'the reply couldn't be read'", async () => {
    mount();
    await generate();
    calls[0].respondText(502, "<html>Bad gateway</html>");
    await flush();
    await flush();
    expect(alerts().join(" ")).toMatch(/reply couldn't be read/i);
    expect(container.querySelector('[data-testid="error-reference"]')?.textContent).toContain("bad_response");
  });

  it("a dropped connection is a connection problem", async () => {
    mount();
    await generate();
    calls[0].dropConnection();
    await flush();
    await flush();
    expect(alerts().join(" ")).toMatch(/Couldn't reach the server/i);
    expect(container.querySelector('[data-testid="error-reference"]')?.textContent).toContain("network_error");
    await click("Try again");
    await answer(1, 200, cards("BACK"));
    expect(alerts()).toEqual([]);
    expect(text()).toContain("BACK bowl");
  });
});

describe("a picture that fails is a picture problem, not a failed recommendation", () => {
  it("cards made, picture generation fails: only the picture says so — no recommendation error, no 'previous' label", async () => {
    resetStore();
    act(() => root.unmount());
    root = createRoot(container);
    imageResponse = () => Response.json({ url: null, reason: "generation_failed" });
    act(() =>
      root.render(
        <HomeFlow
          ownerId="u1"
          defaults={rememberedDefaults([{ decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy", craving: null, ingredients_on_hand: [], budget_override_usd: 10 }])}
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
    await click(/^Make something/);
    await click(/Show me meals/);
    await answer(0, 200, cookCards("COOK"));
    await flush();
    await flush();

    expect(text()).toContain("COOK rice"); // the recommendation is fine
    expect(alerts()).toEqual([]); // no recommendation failure
    expect(text()).not.toMatch(/previous recommendations|Couldn't find|went wrong/i);
    expect(text()).toMatch(/Couldn't make a picture/); // the picture says what happened
    expect(container.querySelector('figure[data-image-state="failed"]')).not.toBeNull();
  });
});
