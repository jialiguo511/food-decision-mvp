// "Show me 3 more" for nearby places, through the real route over an in-memory
// database and a fake Places provider. One DECISION is every batch the user has
// been shown since they last asked a new question; a place shown anywhere in it
// must not come back in a later batch.
//
// Root cause this pins: the client sent only the LAST batch (`previous_
// recommendations`), and the server excluded only that. So batch 3 excluded
// batch 2 but not batch 1 — and a place from batch 1 could return.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NearbyPlace } from "@/lib/places/provider";
import { createFakeDb } from "@/test/fakeSupabase";

let db = createFakeDb();
let currentUser = "user-1";
const searchNearby = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor(currentUser) }));
vi.mock("@/lib/places", () => ({ resolvePlacesProvider: () => ({ searchNearby }) }));
vi.mock("./claude", () => ({ generateRecommendations: vi.fn() }));

import { POST } from "./route";

const CONTEXT = { decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "eat_nearby", meal_budget: "no_preference", travel_willingness: "nearby", nearby: true };
const LOCATION = { latitude: 37.78, longitude: -122.41 };

/** Seven open places, nearest first, so each batch of three is predictable. */
const POOL: NearbyPlace[] = Array.from({ length: 7 }, (_, n) => ({
  id: `p${n + 1}`,
  name: `Place ${n + 1}`,
  category: "Restaurant",
  primary_type: "restaurant",
  address: null,
  location: { latitude: 37.78 + (n + 1) * 0.0004, longitude: -122.41 },
  operational: true,
  open_now: true,
  price_level: null,
  maps_url: `https://maps/p${n + 1}`,
  website_url: null,
}));

type Card = { place_id: string; role: string };
type Reply = { status: number; body: { recommendations?: Card[]; shown_place_ids?: string[]; no_more?: boolean; session_id?: string; error?: { code: string } } };

async function ask(extra: Record<string, unknown> = {}, signal?: AbortSignal): Promise<Reply> {
  const res = await POST(new Request("http://localhost/api/recommend", { method: "POST", body: JSON.stringify({ context: CONTEXT, location: LOCATION, ...extra }), signal }));
  return { status: res.status, body: await res.json() };
}
const ids = (r: Reply) => (r.body.recommendations ?? []).map((c) => c.place_id);
const sessions = () => (db.tables.decision_sessions ?? []) as { id: string; context: Record<string, unknown>; recommendations: Card[] }[];

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  searchNearby.mockReset();
  searchNearby.mockResolvedValue(POOL);
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => {});
});

describe("the cumulative exclusion — one decision, every batch", () => {
  it("three batches in a row never repeat a place from ANY earlier batch", async () => {
    const first = await ask();
    expect(first.status).toBe(200);
    expect(ids(first)).toHaveLength(3);

    const second = await ask({ previous_recommendations: first.body.recommendations, shown_place_ids: first.body.shown_place_ids });
    const third = await ask({ previous_recommendations: second.body.recommendations, shown_place_ids: second.body.shown_place_ids });

    const all = [...ids(first), ...ids(second), ...ids(third)];
    expect(new Set(all).size).toBe(all.length); // no place twice, across all three
    expect(ids(second).some((id) => ids(first).includes(id))).toBe(false);
    expect(ids(third).some((id) => ids(first).includes(id))).toBe(false); // the batch-1 → batch-3 repeat
  });

  it("returns the whole shown set with each batch, so the browser can send it back", async () => {
    const first = await ask();
    expect(first.body.shown_place_ids?.sort()).toEqual(ids(first).sort());
    const second = await ask({ previous_recommendations: first.body.recommendations, shown_place_ids: first.body.shown_place_ids });
    expect(second.body.shown_place_ids?.sort()).toEqual([...ids(first), ...ids(second)].sort());
  });

  it("remembers the shown set with the stored session, so a reload can carry on from it", async () => {
    const first = await ask();
    const second = await ask({ previous_recommendations: first.body.recommendations, shown_place_ids: first.body.shown_place_ids });
    const stored = sessions().find((s) => s.id === second.body.session_id)!;
    expect((stored.context.shown_place_ids as string[]).sort()).toEqual([...ids(first), ...ids(second)].sort());
  });

  it("an old page that sends only the last batch still gets that batch excluded (nothing is lost)", async () => {
    const first = await ask();
    const second = await ask({ previous_recommendations: first.body.recommendations });
    expect(ids(second).some((id) => ids(first).includes(id))).toBe(false);
  });

  it("a fresh question starts a fresh decision: nothing carried over, so the nearest places are offered again", async () => {
    const first = await ask();
    await ask({ previous_recommendations: first.body.recommendations, shown_place_ids: first.body.shown_place_ids });
    const fresh = await ask(); // changed answers / a new request: no shown set sent
    expect(ids(fresh)).toEqual(ids(first));
    expect(fresh.body.shown_place_ids?.sort()).toEqual(ids(first).sort());
  });

  it("a malformed shown list is ignored, never trusted into the query", async () => {
    const first = await ask({ shown_place_ids: [1, null, { x: 1 }, "x".repeat(500)] });
    expect(first.status === 200 || first.status === 400).toBe(true);
    if (first.status === 200) expect(ids(first)).toHaveLength(3);
  });
});

describe("running out of places — honest, never padded, never silently widened", () => {
  it("fewer than three left: returns exactly those, and says the pool is spent", async () => {
    let shown: string[] = [];
    let prev: Card[] | undefined;
    for (let n = 0; n < 2; n++) {
      const r = await ask({ previous_recommendations: prev, shown_place_ids: shown });
      prev = r.body.recommendations;
      shown = r.body.shown_place_ids ?? [];
    }
    const third = await ask({ previous_recommendations: prev, shown_place_ids: shown });
    expect(ids(third)).toHaveLength(1); // 7 places: 3 + 3 + 1
    expect(third.body.recommendations).toHaveLength(1);
    expect(new Set([...shown, ...ids(third)]).size).toBe(7);
  });

  it("nothing new left: no new session is stored (the cards on screen stay), and the reply says so", async () => {
    let shown: string[] = [];
    let prev: Card[] | undefined;
    for (let n = 0; n < 3; n++) {
      const r = await ask({ previous_recommendations: prev, shown_place_ids: shown });
      prev = r.body.recommendations;
      shown = r.body.shown_place_ids ?? [];
    }
    const before = sessions().length;
    const none = await ask({ previous_recommendations: prev, shown_place_ids: shown });
    expect(none.status).toBe(200);
    expect(none.body.no_more).toBe(true);
    expect(none.body.recommendations).toBeUndefined();
    expect(sessions().length).toBe(before); // nothing persisted: a reload restores the last real batch
  });

  it("does not widen the search to find more: every request asks Places for the same radius", async () => {
    let shown: string[] = [];
    let prev: Card[] | undefined;
    for (let n = 0; n < 4; n++) {
      const r = await ask({ previous_recommendations: prev, shown_place_ids: shown });
      prev = r.body.recommendations ?? prev;
      shown = r.body.shown_place_ids ?? shown;
    }
    const radii = searchNearby.mock.calls.map((c) => (c[0] as { radius_m: number }).radius_m);
    expect(new Set(radii).size).toBe(1);
  });

  it("a first search with nothing at all is still the existing empty result — not 'no more'", async () => {
    searchNearby.mockResolvedValue([]);
    const first = await ask();
    expect(first.status).toBe(200);
    expect(first.body.no_more).toBeUndefined();
    expect(first.body.recommendations).toEqual([]);
  });
});

describe("a shown place is not a disliked place", () => {
  it("being shown writes no feedback and changes no preference", async () => {
    const first = await ask();
    await ask({ previous_recommendations: first.body.recommendations, shown_place_ids: first.body.shown_place_ids });
    expect(db.tables.place_feedback ?? []).toEqual([]);
    expect(db.tables.profiles ?? []).toEqual([]);
  });

  it("a place the user DID mark 'not for me' stays excluded in a fresh decision too (that is a different thing)", async () => {
    db.seed("place_feedback", { user_id: "user-1", provider: "google_places", place_id: "p1", action: "exclude", reason: "closed" });
    const first = await ask();
    expect(ids(first)).not.toContain("p1");
  });
});

describe("an abandoned request can't write over a newer one", () => {
  it("a request whose browser went away before the results were stored writes nothing", async () => {
    const controller = new AbortController();
    searchNearby.mockImplementation(async () => {
      controller.abort(); // the user changed their mind while Places was answering
      return POOL;
    });
    const before = sessions().length;
    await ask({}, controller.signal);
    expect(sessions().length).toBe(before);
  });
});
