// The request lifecycle across navigation: leaving Home while a request runs and
// coming back shows THAT request — loading, then its cards — never the older
// page, and never a second request.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookContext } from "@/test/cookFixtures";
import { recipe } from "@/test/savedFixtures";
import type { ActiveSession } from "@/lib/types";

const rescoreSession = vi.fn();
vi.mock("./actions", () => ({
  chooseRecommendation: vi.fn(async (_id: string, index: 0 | 1 | 2) => ({ ok: true, chosenIndex: index })),
  rescoreSession: (...args: unknown[]) => rescoreSession(...args),
}));
vi.mock("@/lib/location", () => ({
  LocationError: class extends Error {},
  requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })),
}));

import { choose, enrich, getSnapshot, needsEnrichment, rescore, resetStore, retry, run, viewOf } from "./recommendStore";

const OLD: ActiveSession = { session_id: "old", context: cookContext(), recommendations: [recipe({ title: "Old Dish" })] as ActiveSession["recommendations"] };
const initial = { session: OLD, chosenIndex: null };

type Deferred = { resolve: (body: unknown, ok?: boolean) => void };
let pending: Deferred[];
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetStore();
  pending = [];
  fetchSpy = vi.fn(
    () =>
      new Promise((resolve) => {
        pending.push({ resolve: (body, ok = true) => resolve({ ok, status: ok ? 200 : 500, json: async () => body }) });
      }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const success = (id: string, title: string) => ({ recommendations: [recipe({ title })], session_id: id, saved: { recipeIndexes: [], placeIds: [] } });
const view = () => viewOf(getSnapshot(), "u1", initial);

describe("a request outlives the screen that started it", () => {
  it("before anything runs, Home shows what the server restored", () => {
    expect(view()).toMatchObject({ live: false, session: OLD, request: { kind: "idle" } });
  });

  it("while running, coming back shows the loading state — not the old session as if it were current", async () => {
    const started = run("u1", cookContext());
    await Promise.resolve();
    // Home unmounts here (user switched tabs) and a new Home mounts: it reads the store.
    expect(view()).toMatchObject({ live: true, request: { kind: "loading" }, requested: { decision_mode: "cook" } });
    // The old cards are not what the screen is about to show as the answer:
    expect(view().request.kind).toBe("loading");
    pending[0].resolve(success("new", "New Dish"));
    await started;
    expect(view()).toMatchObject({ live: true, request: { kind: "idle" }, session: { session_id: "new" } });
    expect(view().session?.recommendations[0]).toMatchObject({ title: "New Dish" });
  });

  it("returning to Home never starts a second request while one is running", async () => {
    const first = run("u1", cookContext());
    await Promise.resolve();
    void run("u1", cookContext()); // e.g. "Use again" tapped on the remounted Home
    void retry("u1");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    pending[0].resolve(success("new", "New Dish"));
    await first;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a request that finished while Home was away is there when it returns", async () => {
    const started = run("u1", cookContext());
    await Promise.resolve();
    pending[0].resolve(success("new", "New Dish"));
    await started;
    // The server's restore is the OLD session (the page was rendered before it finished).
    expect(viewOf(getSnapshot(), "u1", initial).session?.session_id).toBe("new");
  });

  it("a failed request comes back as its error, not as the old cards", async () => {
    const started = run("u1", cookContext());
    await Promise.resolve();
    pending[0].resolve({ error: { code: "upstream_timeout", message: "x" } }, false);
    await started;
    expect(view()).toMatchObject({ live: true, request: { kind: "error" } });
  });

  it("when the server restored the same session, its fresher Saved state is used and the pick is kept", async () => {
    const started = run("u1", cookContext());
    await Promise.resolve();
    pending[0].resolve(success("old", "Old Dish"));
    await started;
    const saved: ActiveSession = { ...OLD, saved: { recipeIndexes: [0], placeIds: [] } };
    expect(viewOf(getSnapshot(), "u1", { session: saved, chosenIndex: null }).session).toBe(saved);
  });

  it("Show me 3 more sends the previous cards as exclusions, once", async () => {
    const started = run("u1", OLD.context, OLD.recommendations);
    await Promise.resolve();
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).previous_recommendations).toHaveLength(1);
    pending[0].resolve(success("n", "N"));
    await started;
  });
});

describe("what counts as current", () => {
  it("a finished session older than the restore window falls back to the server, like a fresh visit", async () => {
    const started = run("u1", cookContext());
    await Promise.resolve();
    pending[0].resolve(success("new", "New Dish"));
    await started;
    const later = Date.now() + 7 * 60 * 60 * 1000;
    expect(viewOf(getSnapshot(), "u1", initial, later)).toMatchObject({ live: false, session: OLD });
  });

  it("another account in the same tab starts clean", async () => {
    const started = run("u1", cookContext());
    await Promise.resolve();
    pending[0].resolve(success("new", "New Dish"));
    await started;
    expect(viewOf(getSnapshot(), "u2", initial)).toMatchObject({ live: false, session: OLD });
  });

  it("a response for a previous user is dropped when another signs in mid-request", async () => {
    const first = run("u1", cookContext());
    await Promise.resolve();
    void run("u2", cookContext()); // claims the store; resets generation
    pending[0].resolve(success("stale", "Stale"));
    await first;
    expect(getSnapshot().session?.session_id).not.toBe("stale");
  });
});

describe("choosing", () => {
  it("adopts a server-restored session, records the pick once", async () => {
    await choose("u1", OLD, 1);
    expect(view()).toMatchObject({ live: true, selection: { status: "chosen", index: 1 } });
    await choose("u1", OLD, 2); // already chosen: ignored
    expect(view().selection).toMatchObject({ index: 1 });
  });
});

describe("nearby wording arrives after the places", () => {
  const nearbyContext = { decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "eat_nearby", meal_budget: "no_preference", travel_willingness: "no_preference", nearby: true } as const;
  const placeCard = (id: string, over: Record<string, unknown> = {}) => ({
    decision_mode: "nearby", role: "best_match", title: `Place ${id}`, place_id: id, reason: "rule", look_for: null, category: null, address: null,
    distance_m: 100, open_now: true, price_level: null, maps_url: `https://maps.example/${id}`, website_url: null, enriched: false, ...over,
  });

  it("the places show at once; the model's wording is asked for once and merged in without reordering", async () => {
    const started = run("u1", nearbyContext as never);
    await Promise.resolve();
    await Promise.resolve();
    pending[0].resolve({ recommendations: [placeCard("a"), placeCard("b", { role: "lowest_effort" })], session_id: "n1", enrichment_pending: true });
    await started;

    // Cards are on screen already, still pending wording, and the request is over.
    expect(view()).toMatchObject({ request: { kind: "idle" }, session: { session_id: "n1" } });
    expect(needsEnrichment(view().session)).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/recommend/enrich");

    pending[1].resolve({ recommendations: [placeCard("a", { reason: "Why a", look_for: "A bowl.", enriched: true }), placeCard("b", { role: "lowest_effort", enriched: true, reason: "Why b", look_for: "Soup." })], enriched: true });
    await vi.waitFor(() => expect(needsEnrichment(view().session)).toBe(false));
    expect(view().session?.recommendations.map((r) => (r as { place_id: string }).place_id)).toEqual(["a", "b"]);
    expect((view().session?.recommendations[0] as { reason: string }).reason).toBe("Why a");

    // Asking again for the same session spends nothing.
    await enrich("u1", "n1");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("a failed or empty enrichment leaves the places exactly as they were", async () => {
    const started = run("u1", nearbyContext as never);
    await Promise.resolve();
    await Promise.resolve();
    pending[0].resolve({ recommendations: [placeCard("a")], session_id: "n2", enrichment_pending: true });
    await started;
    pending[1].resolve({}, false);
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(view().session?.recommendations).toHaveLength(1);
    expect((view().session?.recommendations[0] as { reason: string }).reason).toBe("rule");
    expect(view().request.kind).toBe("idle");
  });
});

describe("re-scoring the cards on screen when nutrition targets change", () => {
  const rescored = (order: string[], changed = true) => ({
    ok: true, rescored: true, changed, targetsSig: "sig-new", saved: { recipeIndexes: [], placeIds: [] },
    recommendations: order.map((title) => recipe({ title })),
  });
  const mine: ActiveSession = { session_id: "s1", context: cookContext(), recommendations: [recipe({ title: "A" }), recipe({ title: "B" })] as ActiveSession["recommendations"] };

  beforeEach(() => {
    rescoreSession.mockReset();
  });

  it("swaps in the re-ordered cards, records the new signature, and says so", async () => {
    rescoreSession.mockResolvedValue(rescored(["B", "A"]));
    await rescore("u1", mine, "sig-new", { explicit: true });
    expect(rescoreSession).toHaveBeenCalledWith("s1");
    expect(view().session?.recommendations.map((r) => r.title)).toEqual(["B", "A"]);
    expect(view().session?.targets_sig).toBe("sig-new");
    expect(view().notice).toEqual({ sessionId: "s1", kind: "updated" });
  });

  it("an order that already fits still gets feedback when the user just changed their details", async () => {
    rescoreSession.mockResolvedValue(rescored(["A", "B"], false));
    await rescore("u1", mine, "sig-new", { explicit: true });
    expect(view().notice).toEqual({ sessionId: "s1", kind: "checked" });
  });

  it("a quiet re-check of a restored set that already fit says nothing (it would repeat on every reload)", async () => {
    rescoreSession.mockResolvedValue(rescored(["A", "B"], false));
    await rescore("u1", mine, "sig-new", { explicit: false });
    expect(view().notice).toBeNull();
  });

  it("asks once per (session, targets) — a re-render can't ask again", async () => {
    rescoreSession.mockResolvedValue(rescored(["B", "A"]));
    await rescore("u1", mine, "sig-new", { explicit: true });
    await rescore("u1", mine, "sig-new", { explicit: true });
    expect(rescoreSession).toHaveBeenCalledTimes(1);
  });

  it("nothing to ask when the cards were already made under these targets", async () => {
    await rescore("u1", { ...mine, targets_sig: "sig-new" }, "sig-new", { explicit: true });
    expect(rescoreSession).not.toHaveBeenCalled();
  });

  it("when the server skips (a pick was made), the cards stay and only the signature is recorded", async () => {
    rescoreSession.mockResolvedValue({ ok: true, rescored: false, targetsSig: "sig-new" });
    await rescore("u1", mine, "sig-new", { explicit: true });
    expect(view().session?.recommendations.map((r) => r.title)).toEqual(["A", "B"]);
    expect(view().session?.targets_sig).toBe("sig-new");
    expect(view().notice).toBeNull();
  });

  it("a failure never disturbs the cards", async () => {
    rescoreSession.mockRejectedValue(new Error("network"));
    await rescore("u1", mine, "sig-new", { explicit: true });
    expect(view().session?.recommendations.map((r) => r.title)).toEqual(["A", "B"]);
    expect(view().notice).toBeNull();
  });

  it("a new request clears the notice — it belongs to the cards it described", async () => {
    rescoreSession.mockResolvedValue(rescored(["B", "A"]));
    await rescore("u1", mine, "sig-new", { explicit: true });
    const started = run("u1", cookContext());
    await Promise.resolve();
    pending[0].resolve(success("n", "New"));
    await started;
    expect(view().notice).toBeNull();
  });
});
