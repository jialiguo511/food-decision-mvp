import { describe, expect, it, vi } from "vitest";
import { recordEvent } from "./record";
import { CLIENT_EVENT_NAMES, clientEventSchema, eventSchema } from "./schema";

describe("the event contract — names and enumerated props, nothing free-form", () => {
  it("drops any prop it doesn't list: typed text, foods, health notes or coordinates can't ride along", () => {
    const parsed = eventSchema.parse({ name: "entry_selected", props: { entry: "sentence", text: "I want ramen", allergy: "peanut", latitude: 1.5 } });
    expect(parsed.props).toEqual({ entry: "sentence" });
  });

  it("rejects values outside the vocabulary", () => {
    expect(eventSchema.safeParse({ name: "entry_selected", props: { entry: "I want ramen" } }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "recommend_done", props: { mode: "cook", ok: true, ms: 5, code: "Has Spaces And Text!" } }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "limit_hit", props: { kind: "everything" } }).success).toBe(false);
    expect(eventSchema.safeParse({ name: "typed_text", props: {} }).success).toBe(false);
  });

  it("the browser may only report the events only the browser can see", () => {
    expect([...CLIENT_EVENT_NAMES].sort()).toEqual(["clarify_shown", "entry_selected"]);
    expect(clientEventSchema.safeParse({ name: "entry_selected", props: { entry: "steps", mode: "cook" } }).success).toBe(true);
    expect(clientEventSchema.safeParse({ name: "clarify_shown", props: { asked: 2 } }).success).toBe(true);
    // Server facts can't be forged from the page.
    expect(clientEventSchema.safeParse({ name: "recommend_done", props: { mode: "cook", ok: true, ms: 1 } }).success).toBe(false);
    expect(clientEventSchema.safeParse({ name: "choice_made", props: { mode: "cook", role: "best_match" } }).success).toBe(false);
    expect(clientEventSchema.safeParse({ name: "limit_hit", props: { kind: "recommend" } }).success).toBe(false);
  });
});

describe("recordEvent — a note, never part of the loop", () => {
  const warn = () => vi.spyOn(console, "warn").mockImplementation(() => {});

  it("writes the user's own row", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    await recordEvent({ from: () => ({ insert }) } as never, "u1", { name: "limit_hit", props: { kind: "image" } });
    expect(insert).toHaveBeenCalledWith({ user_id: "u1", name: "limit_hit", props: { kind: "image" } });
  });

  it("never throws: a database error, a throw, or a malformed event is dropped with a content-free warning", async () => {
    const w = warn();
    await recordEvent({ from: () => ({ insert: async () => ({ error: { code: "PGRST205" } }) }) } as never, "u1", { name: "limit_hit", props: { kind: "image" } });
    await recordEvent({ from: () => ({ insert: async () => { throw new Error("secret detail"); } }) } as never, "u1", { name: "limit_hit", props: { kind: "image" } });
    await recordEvent({ from: () => ({ insert: vi.fn() }) } as never, "u1", { name: "entry_selected", props: { entry: "nonsense" } } as never);
    expect(w).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(w.mock.calls)).not.toContain("secret detail");
  });
});
