// How many paid model calls one Cook request makes, and what the model is asked
// to do. One request → one `messages.create`: three recommendations come from a
// single structured response, with no per-card calls. The only second call is a
// single, bounded retry when our own validators reject a fast first answer
// (describe "one automatic retry…" below) — never a loop.

import { describe, expect, it, vi } from "vitest";
import { resolveRecommendationInput } from "@/lib/recommend/input";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import { cookContext } from "@/test/cookFixtures";
import { generateRecommendations, modelParams, resolveModelSettings, RETRY_ONLY_IF_FIRST_UNDER_MS } from "./claude";

const card = (title: string) => ({
  title,
  reason: "A reasonable dinner.",
  estimated_minutes: 20,
  estimated_meal_cost_usd: 5,
  estimated_extra_cost_usd: 2,
  estimated_calories: 500,
  estimated_protein_g: 30,
  watch: null,
  ingredients_on_hand: [],
  ingredients_needed: ["rice"],
  equipment: ["Stovetop"],
  steps: ["Cook the rice.", "Serve."],
  inventory_note: null,
  image_query: "rice bowl",
});
const GOOD = JSON.stringify({ best_match: card("Best"), lowest_effort: card("Quick"), alternative: card("Different") });

function fakeClient(text: string, stop_reason = "end_turn") {
  const create = vi.fn(async () => ({
    stop_reason,
    model: "claude-opus-5",
    content: [{ type: "text", text }],
    usage: { input_tokens: 4000, output_tokens: 1500 },
  }));
  return { client: { beta: { messages: { create } } } as never, create };
}
/** One scripted response per call, in order (the last repeats). */
function fakeSequence(responses: { text: string; stop_reason?: string }[]) {
  let call = 0;
  const create = vi.fn(async () => {
    const r = responses[Math.min(call++, responses.length - 1)];
    return {
      stop_reason: r.stop_reason ?? "end_turn",
      model: "claude-opus-5",
      content: [{ type: "text", text: r.text }],
      usage: { input_tokens: 4000, output_tokens: 1500 },
    };
  });
  return { client: { beta: { messages: { create } } } as never, create };
}
/** Three cards, one of which names an air fryer the default profile doesn't own. */
const BREAKS_EQUIPMENT = JSON.stringify({
  best_match: card("Best"),
  lowest_effort: { ...card("Quick"), steps: ["Cook the rice in the air fryer.", "Serve."] },
  alternative: card("Different"),
});
/** The user message the call at `index` sent. */
const userMessageOf = (create: ReturnType<typeof vi.fn>, index: number) =>
  ((create.mock.calls[index] as unknown[])[0] as { messages: { content: string }[] }).messages[0].content;

const input = () => resolveRecommendationInput(DEFAULT_PROFILE, cookContext(), undefined, ["salt"]);
const quiet = () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
};

describe("model calls per Cook request", () => {
  it("a normal request is exactly ONE call, which yields all three recommendations", async () => {
    quiet();
    const { client, create } = fakeClient(GOOD);
    const result = await generateRecommendations(client, input());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendations).toHaveLength(3);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("passes the abort signal to the call, so a superseded request stops spending", async () => {
    quiet();
    const { client, create } = fakeClient(GOOD);
    const controller = new AbortController();
    await generateRecommendations(client, input(), [], undefined, { signal: controller.signal });
    expect((create.mock.calls[0] as unknown[])[1]).toMatchObject({ signal: controller.signal });
  });

  it("records prompt, model and parse on the timer", async () => {
    quiet();
    const { client } = fakeClient(GOOD);
    const record = vi.fn();
    await generateRecommendations(client, input(), [], { record } as never);
    expect(record.mock.calls.map((c) => c[0])).toEqual(["prompt", "model", "parse"]);
  });
});

describe("one automatic retry when our own checks reject the answer", () => {
  it("unusable output is retried exactly once, then fails visibly — never a loop", async () => {
    quiet();
    const { client, create } = fakeClient("not json");
    const result = await generateRecommendations(client, input());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("malformed_output");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("a hard-constraint violation is retried once, and the corrected answer is what the user gets", async () => {
    quiet();
    const { client, create } = fakeSequence([{ text: BREAKS_EQUIPMENT }, { text: GOOD }]);
    const result = await generateRecommendations(client, input());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recommendations.map((r) => r.title)).toEqual(["Best", "Quick", "Different"]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("the retry tells the model what was rejected, and changes nothing else about the request", async () => {
    quiet();
    const { client, create } = fakeSequence([{ text: BREAKS_EQUIPMENT }, { text: GOOD }]);
    await generateRecommendations(client, input());
    const first = userMessageOf(create, 0);
    const second = userMessageOf(create, 1);
    expect(second.startsWith(first)).toBe(true);
    expect(second).toContain("Correction needed");
    expect(second).toMatch(/air fryer/i); // our validator's own finding
    const [a, b] = create.mock.calls.map((c) => (c as unknown[])[0] as Record<string, unknown>);
    expect(b.system).toBe(a.system); // same hard constraints
    expect(b.model).toBe(a.model);
  });

  it("the retry is not a bypass: a second answer that still breaks a constraint is rejected", async () => {
    quiet();
    const { client, create } = fakeSequence([{ text: BREAKS_EQUIPMENT }, { text: BREAKS_EQUIPMENT }]);
    const result = await generateRecommendations(client, input());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("constraint_violation");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("both attempts are counted in the usage that is reported", async () => {
    quiet();
    const { client } = fakeSequence([{ text: BREAKS_EQUIPMENT }, { text: GOOD }]);
    const result = await generateRecommendations(client, input());
    expect(result.ok && result.usage.inputTokens).toBe(8000);
    expect(result.ok && result.usage.outputTokens).toBe(3000);
  });

  it("a refusal or a truncation is never retried — asking again would not change it", async () => {
    quiet();
    for (const stop_reason of ["refusal", "max_tokens"]) {
      const { client, create } = fakeClient(GOOD, stop_reason);
      const result = await generateRecommendations(client, input());
      expect(result.ok).toBe(false);
      expect(create).toHaveBeenCalledTimes(1);
    }
  });

  it("a failed call is not retried here (the SDK retries transient transport errors itself)", async () => {
    quiet();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const create = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await generateRecommendations({ beta: { messages: { create } } } as never, input());
    expect(result.ok).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("no retry once the user has moved on", async () => {
    quiet();
    const controller = new AbortController();
    const create = vi.fn(async () => {
      controller.abort(); // the user changed their answers while this call was running
      return { stop_reason: "end_turn", model: "claude-opus-5", content: [{ type: "text", text: "not json" }], usage: { input_tokens: 1, output_tokens: 1 } };
    });
    const result = await generateRecommendations({ beta: { messages: { create } } } as never, input(), [], undefined, { signal: controller.signal });
    expect(result.ok).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("no retry when the first attempt was already slow — a second wait would be the very problem", async () => {
    quiet();
    const now = vi.spyOn(Date, "now");
    now.mockReturnValueOnce(0).mockReturnValue(RETRY_ONLY_IF_FIRST_UNDER_MS + 1_000);
    const { client, create } = fakeSequence([{ text: BREAKS_EQUIPMENT }, { text: GOOD }]);
    const result = await generateRecommendations(client, input());
    now.mockRestore();
    expect(result.ok).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("model settings → request fields", () => {
  it("the default is Sonnet 5.5, adaptive thinking, low effort — chosen from the benchmark for speed, not maximum reasoning", () => {
    const settings = resolveModelSettings({});
    expect(settings).toEqual({ model: "claude-sonnet-5-5", effort: "low", thinking: "adaptive" });
    expect(modelParams(settings)).toEqual({ thinking: { type: "adaptive" }, effort: "low" });
  });

  it("the environment can still pick any model, effort and thinking mode — Opus included — without a code change", () => {
    const settings = resolveModelSettings({ RECOMMEND_MODEL: " claude-opus-5 ", RECOMMEND_EFFORT: "high", RECOMMEND_THINKING: "off" });
    expect(settings).toEqual({ model: "claude-opus-5", effort: "high", thinking: "off" });
    expect(resolveModelSettings({ RECOMMEND_EFFORT: "nonsense" }).effort).toBe("low");
  });

  it("'off' is spelled per model — omitting `thinking` would mean ADAPTIVE on these models", () => {
    expect(modelParams({ model: "claude-opus-5", effort: "low", thinking: "off" }).thinking).toEqual({ type: "disabled" });
    expect(modelParams({ model: "claude-sonnet-5-5", effort: "low", thinking: "off" }).thinking).toEqual({ type: "between_tools" });
    // Opus 5.5 cannot turn thinking off: nothing is sent, effort is the lever.
    expect(modelParams({ model: "claude-opus-5-5", effort: "low", thinking: "off" })).toEqual({ effort: "low" });
  });

  it("Haiku 4.5 takes neither effort nor thinking", () => {
    expect(modelParams({ model: "claude-haiku-4-5", effort: "high", thinking: "adaptive" })).toEqual({});
  });
});
