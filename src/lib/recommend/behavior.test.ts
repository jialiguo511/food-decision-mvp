import { describe, expect, it } from "vitest";
import { summarizeBehavior, type ChosenRow } from "./behavior";
import { toChosenRow } from "./behaviorQuery";
import { buildSystemPrompt, buildUserMessage } from "./prompt";
import { DEFAULT_PROFILE } from "@/test/profileInput";
import { resolveRecommendationInput } from "./input";
import type { CookRecommendation, MealContext } from "../types";

// Newest first, one per day unless overridden.
function row(i: number, o: Partial<ChosenRow> = {}): ChosenRow {
  const day = String(30 - i).padStart(2, "0");
  return {
    created_at: `2026-09-${day}T19:00:00Z`,
    scope: "cook",
    role: "best_match",
    title: `Dish ${i}`,
    category: null,
    didEat: null,
    ...o,
  };
}
const rows = (n: number, o: (i: number) => Partial<ChosenRow> = () => ({})) =>
  Array.from({ length: n }, (_, i) => row(i, o(i)));

describe("summarizeBehavior — sparse history", () => {
  it("gives a fresh user nothing", () => {
    expect(summarizeBehavior([], "cook")).toBeNull();
  });

  it("gives nothing below the minimum number of choices", () => {
    expect(summarizeBehavior(rows(3, () => ({ role: "lowest_effort" })), "cook")).toBeNull();
  });

  it("gives nothing when all the choices fall on one day", () => {
    const sameDay = rows(6, (i) => ({ created_at: `2026-09-30T1${i}:00:00Z`, role: "lowest_effort" }));
    expect(summarizeBehavior(sameDay, "cook")).toBeNull();
  });

  it("makes no strong inference from two or three easy picks", () => {
    // 4 meaningful choices, only 2 easy → no lean, just variety titles.
    const hints = summarizeBehavior(rows(4, (i) => ({ role: i < 2 ? "lowest_effort" : "best_match" })), "cook");
    expect(hints?.leans).toEqual([]);
  });
});

describe("summarizeBehavior — soft hints", () => {
  it("turns repeated easy picks into a single tentative lean with counts", () => {
    const hints = summarizeBehavior(rows(6, (i) => ({ role: i === 5 ? "best_match" : "lowest_effort" })), "cook");
    expect(hints?.leans).toEqual(["Often picks the easiest option (5 of their last 6 choices)."]);
  });

  it("lists recent titles (deduped) for variety only", () => {
    const hints = summarizeBehavior(rows(6, (i) => ({ title: i % 2 ? "Oats" : "Toast" })), "cook");
    expect(hints?.recent_choices).toEqual(["Toast", "Oats"]);
  });

  it("only looks at a bounded window of recent choices", () => {
    // 25 newest are best_match; the 10 older easy picks fall outside the window.
    const many = [...rows(25), ...rows(10, (i) => ({ created_at: `2026-08-${String(10 + i).padStart(2, "0")}T19:00:00Z`, role: "lowest_effort" }))];
    expect(summarizeBehavior(many, "cook")?.leans).toEqual([]);
  });

  it("does not count a picked-but-not-eaten meal as a positive", () => {
    const notEaten = rows(6, () => ({ role: "lowest_effort", didEat: false }));
    expect(summarizeBehavior(notEaten, "cook")).toBeNull();
    const mixed = rows(8, (i) => ({ role: "lowest_effort", didEat: i < 4 ? false : null }));
    expect(summarizeBehavior(mixed, "cook")?.leans[0]).toContain("4 of their last 4");
  });

  it("turns repeated nearby categories into a lean, with no dish titles", () => {
    const hints = summarizeBehavior(
      rows(6, (i) => ({ scope: "nearby", category: i < 4 ? "Thai restaurant" : "Cafe", title: `Place ${i}` })),
      "nearby",
    );
    expect(hints?.leans).toEqual(['Has often chosen "Thai restaurant" places (4 of their last 6 choices).']);
    expect(hints?.recent_choices).toBeUndefined();
  });
});

describe("summarizeBehavior — modes stay separate", () => {
  const cookEasy = rows(8, () => ({ scope: "cook", role: "lowest_effort" }));

  it("never applies cook history to another mode", () => {
    expect(summarizeBehavior(cookEasy, "order")).toBeNull();
    expect(summarizeBehavior(cookEasy, "store_snack")).toBeNull();
    expect(summarizeBehavior(cookEasy, "nearby")).toBeNull();
  });

  it("gives snack no effort lean — there, lowest_effort means 'more indulgent'", () => {
    const snack = rows(8, () => ({ scope: "store_snack", role: "lowest_effort" }));
    expect(summarizeBehavior(snack, "store_snack")?.leans).toEqual([]);
  });

  it("keeps order and nearby (both Eat out) apart", () => {
    const nearby = rows(8, () => ({ scope: "nearby", category: "Thai restaurant" }));
    expect(summarizeBehavior(nearby, "order")).toBeNull();
  });
});

describe("toChosenRow — what is read from a session", () => {
  const base = {
    id: "s1",
    created_at: "2026-09-30T19:00:00Z",
    chosen_index: 1,
    mode: "cook",
    nearby: null,
    t0: "A", r0: "best_match", c0: null,
    t1: "B", r1: "lowest_effort", c1: null,
    t2: "C", r2: "alternative", c2: null,
  };

  it("reads the chosen card only", () => {
    expect(toChosenRow(base, new Map([["s1", true]]))[0]).toMatchObject({ scope: "cook", role: "lowest_effort", title: "B", didEat: true });
  });

  it("treats a legacy row with no mode as cook, and nearby orders as nearby", () => {
    expect(toChosenRow({ ...base, mode: null }, new Map())[0].scope).toBe("cook");
    expect(toChosenRow({ ...base, mode: "order", nearby: "true", c1: "Thai restaurant" }, new Map())[0]).toMatchObject({ scope: "nearby", category: "Thai restaurant" });
    expect(toChosenRow({ ...base, mode: "order" }, new Map())[0].scope).toBe("order");
  });

  it("skips unchosen or unreadable rows", () => {
    expect(toChosenRow({ ...base, chosen_index: null }, new Map())).toEqual([]);
    expect(toChosenRow({ ...base, mode: "weird" }, new Map())).toEqual([]);
  });

  it("carries no ingredients or craving — the ChosenRow shape has no place for them", () => {
    const out = toChosenRow({ ...base, ingredients_on_hand: ["Chicken"], craving: "ramen" }, new Map())[0];
    expect(Object.keys(out).sort()).toEqual(["category", "created_at", "didEat", "role", "scope", "title"]);
  });
});

describe("recommender input and prompt", () => {
  const context: MealContext = {
    decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy",
    craving: "ramen", ingredients_on_hand: ["Eggs"], budget_override_usd: null,
  };
  const hints = { recent_choices: ["Toast"], leans: ["Often picks the easiest option (5 of their last 6 choices)."] };

  it("a fresh user's input and prompt carry no behavioral section", () => {
    const input = resolveRecommendationInput({ ...DEFAULT_PROFILE }, context, undefined, [], null);
    expect("behavioral_hints" in input).toBe(false);
    expect(buildSystemPrompt(input)).not.toContain("Behavioral hints");
  });

  it("with hints, states they are lowest priority, soft, and variety-preserving", () => {
    const input = resolveRecommendationInput({ ...DEFAULT_PROFILE }, context, undefined, [], hints);
    const prompt = buildSystemPrompt(input);
    expect(prompt).toContain("Behavioral hints (lowest priority)");
    expect(prompt).toContain("everything above outranks it");
    expect(prompt).toContain("Profile preferences");
    expect(prompt).toContain("craving");
    expect(prompt).toContain("never a constraint or a filter");
    expect(prompt).toContain("never infer a dislike");
    expect(prompt).toContain("Preserve variety");
    expect(buildUserMessage(input)).toContain("behavioral_hints");
  });

  it("does not touch the hard constraints or the craving/ingredients in the input", () => {
    const plain = resolveRecommendationInput({ ...DEFAULT_PROFILE }, context, undefined, [], null);
    const withHints = resolveRecommendationInput({ ...DEFAULT_PROFILE }, context, undefined, [], hints);
    expect(withHints.hard_constraints).toEqual(plain.hard_constraints);
    expect(withHints.decision_mode === "cook" && withHints.soft_preferences).toEqual(
      plain.decision_mode === "cook" && plain.soft_preferences,
    );
  });

  it("'Show me 3 more' still carries its avoid-repeats section alongside hints", () => {
    const prev = [{ decision_mode: "cook", role: "best_match", title: "Toast", reason: "x" }] as unknown as CookRecommendation[];
    const input = resolveRecommendationInput({ ...DEFAULT_PROFILE }, context, prev, [], hints);
    const prompt = buildSystemPrompt(input);
    expect(prompt).toContain("Avoiding repeats");
    expect(prompt).toContain("Behavioral hints");
  });

  it("omits the recent_choices bullet when there are none (nearby)", () => {
    const input = resolveRecommendationInput({ ...DEFAULT_PROFILE }, context, undefined, [], { leans: ["x"] });
    expect(buildSystemPrompt(input)).not.toContain("`recent_choices`");
  });
});

describe("behavioral hints are off for the public beta", () => {
  it("only an explicit BEHAVIORAL_HINTS=on turns the inferred-memory read-back on", async () => {
    const { behavioralHintsEnabled } = await import("./behaviorQuery");
    expect(behavioralHintsEnabled({})).toBe(false);
    for (const v of ["", "off", "true", "1", "yes"]) expect(behavioralHintsEnabled({ BEHAVIORAL_HINTS: v }), v).toBe(false);
    expect(behavioralHintsEnabled({ BEHAVIORAL_HINTS: "on" })).toBe(true);
    expect(behavioralHintsEnabled({ BEHAVIORAL_HINTS: " ON " })).toBe(true);
  });
});
