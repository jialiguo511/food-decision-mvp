// "Show me 3 more" for nearby places, in the browser's request store: the whole
// shown list travels with each request, "nothing new" keeps the cards on screen,
// a retry keeps the exclusion, and an older answer can never overwrite a newer one.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { place } from "@/test/savedFixtures";
import type { ActiveSession, DecisionContext } from "@/lib/types";

vi.mock("./actions", () => ({ chooseRecommendation: vi.fn(), rescoreSession: vi.fn() }));
vi.mock("@/lib/location", () => ({ LocationError: class extends Error {}, requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })) }));

import { enrich, getSnapshot, resetStore, retry, run, viewOf } from "./recommendStore";

const NEARBY: DecisionContext = { decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "eat_nearby", meal_budget: "no_preference", travel_willingness: "nearby", nearby: true };
const card = (id: string) => place({ place_id: id, title: `Place ${id}` });
const set = (...ids: string[]) => ids.map(card);

type Pending = { resolve: (body: unknown, ok?: boolean) => void };
let pending: Pending[];
let sent: { shown_place_ids?: string[]; previous_recommendations?: unknown; entry?: string }[];

beforeEach(() => {
  resetStore();
  pending = [];
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (String(url).endsWith("/api/recommend")) sent.push(JSON.parse(String(init?.body)));
      return new Promise((resolve) => pending.push({ resolve: (body, ok = true) => resolve({ ok, status: ok ? 200 : 500, json: async () => body }) }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const batch = (sessionId: string, ids: string[], shown: string[]) => ({ recommendations: set(...ids), session_id: sessionId, shown_place_ids: shown, nutrition_is_estimate: true });
const view = () => viewOf(getSnapshot(), "u1", { session: null, chosenIndex: null });
/** `run` asks for the location (async) before it sends — let that happen. */
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (index: number, body: unknown) => {
  await tick();
  pending[index].resolve(body);
  await new Promise((r) => setTimeout(r, 0));
};

describe("the shown list rides with every 'more'", () => {
  it("is stored on the session from the response, and sent back with the next request", async () => {
    void run("u1", NEARBY);
    await settle(0, batch("s1", ["a", "b", "c"], ["a", "b", "c"]));
    expect(view().session?.shown_place_ids).toEqual(["a", "b", "c"]);

    void run("u1", NEARBY, view().session!.recommendations, "more", view().session!.shown_place_ids);
    await tick();
    expect(sent[1].shown_place_ids).toEqual(["a", "b", "c"]);
    await settle(1, batch("s2", ["d", "e", "f"], ["a", "b", "c", "d", "e", "f"]));

    // The third request carries BOTH earlier batches — the one the old code lost.
    void run("u1", NEARBY, view().session!.recommendations, "more", view().session!.shown_place_ids);
    await tick();
    expect(sent[2].shown_place_ids).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("a fresh question sends no list, so it starts a new decision", async () => {
    void run("u1", NEARBY);
    await tick();
    expect(sent[0].shown_place_ids).toBeUndefined();
  });

  it("'Try again' after a failed 'more' keeps the exclusion — a retry is the same request", async () => {
    void run("u1", NEARBY, set("a", "b", "c"), "more", ["a", "b", "c", "x", "y"]);
    await tick();
    pending[0].resolve({ error: { code: "places_unavailable", message: "x" } }, false);
    await tick();
    retry("u1");
    await tick();
    expect(sent[1].shown_place_ids).toEqual(["a", "b", "c", "x", "y"]);
    expect(sent[1].entry).toBe("more");
  });
});

describe("nothing new left", () => {
  it("keeps the cards on screen (and a pick), says there is no more, and stores no new session", async () => {
    void run("u1", NEARBY);
    await settle(0, batch("s1", ["a", "b", "c"], ["a", "b", "c"]));
    expect(view().noMore).toBe(false);

    void run("u1", NEARBY, view().session!.recommendations, "more", ["a", "b", "c"]);
    await settle(1, { no_more: true, shown_place_ids: ["a", "b", "c"] });

    expect(view()).toMatchObject({ noMore: true, request: { kind: "idle" }, session: { session_id: "s1" } });
    expect(view().session?.recommendations.map((r) => (r as { place_id: string }).place_id)).toEqual(["a", "b", "c"]);
  });

  it("clears the moment anything new is asked — it describes one session only", async () => {
    void run("u1", NEARBY);
    await settle(0, batch("s1", ["a", "b", "c"], ["a", "b", "c"]));
    void run("u1", NEARBY, view().session!.recommendations, "more", ["a", "b", "c"]);
    await settle(1, { no_more: true, shown_place_ids: ["a", "b", "c"] });
    expect(view().noMore).toBe(true);

    void run("u1", { ...NEARBY, travel_willingness: "worth_a_trip" }); // Change → a wider distance
    expect(view().noMore).toBe(false);
    await settle(2, batch("s2", ["a", "b", "c", "d"].slice(0, 3), ["a", "b", "c"]));
    expect(view()).toMatchObject({ noMore: false, session: { session_id: "s2" } });
    expect(sent[2].shown_place_ids).toBeUndefined(); // a fresh decision: nothing carried over
  });
});

describe("an older answer never overwrites a newer one", () => {
  it("a superseded request's response is dropped", async () => {
    void run("u1", NEARBY); // pending[0]
    await tick();
    void run("u1", { ...NEARBY, travel_willingness: "walkable" }); // changes the question: aborts the first
    await tick();
    pending[1].resolve(batch("new", ["n1", "n2", "n3"], ["n1", "n2", "n3"]));
    await new Promise((r) => setTimeout(r, 0));
    pending[0].resolve(batch("old", ["o1", "o2", "o3"], ["o1", "o2", "o3"])); // arrives late
    await new Promise((r) => setTimeout(r, 0));
    expect(view().session?.session_id).toBe("new");
  });

  it("the model's wording for an OLD set can't be written onto a newer one", async () => {
    void run("u1", NEARBY);
    await settle(0, { ...batch("s1", ["a", "b", "c"], ["a", "b", "c"]), enrichment_pending: true });
    // The wording request for s1 is in flight (pending[1])…
    void run("u1", NEARBY, view().session!.recommendations, "more", ["a", "b", "c"]);
    await settle(2, batch("s2", ["d", "e", "f"], ["a", "b", "c", "d", "e", "f"]));
    // …and arrives after s2 is on screen.
    pending[1].resolve({ recommendations: set("a", "b", "c").map((r) => ({ ...r, reason: "OLD WORDING" })) });
    await new Promise((r) => setTimeout(r, 0));
    expect(view().session?.session_id).toBe("s2");
    expect(view().session?.recommendations.map((r) => (r as { place_id: string }).place_id)).toEqual(["d", "e", "f"]);
    expect(JSON.stringify(view().session)).not.toContain("OLD WORDING");
  });

  it("wording is asked for once per set, and a set the user has left isn't asked for again", async () => {
    const s: ActiveSession = { session_id: "s9", context: NEARBY, recommendations: set("a", "b", "c") };
    void enrich("u1", s.session_id);
    void enrich("u1", s.session_id);
    await tick();
    expect(pending).toHaveLength(1);
  });
});
