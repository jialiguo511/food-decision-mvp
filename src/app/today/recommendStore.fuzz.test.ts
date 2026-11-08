// The request store under every interleaving of submit / retry / success / failure /
// late answer, not just the ones someone thought to write down. Two sequences of
// random operations are generated deterministically (a seeded generator, so a
// failure is reproducible) and after EVERY step the invariants of the screen's
// state are checked:
//
//   * the newest request decides the screen — if it succeeded, no error is showing and
//     the cards are its own; if it failed, the error is its own; while it runs, loading;
//   * an older request's answer, whenever it arrives and whatever it says, changes nothing;
//   * a failure and a newer success are never both on screen.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookContext } from "@/test/cookFixtures";
import { recipe } from "@/test/savedFixtures";

vi.mock("./actions", () => ({ chooseRecommendation: vi.fn(), rescoreSession: vi.fn() }));
vi.mock("@/lib/location", () => ({ LocationError: class extends Error {}, requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })) }));

import { getSnapshot, resetStore, retry, run } from "./recommendStore";

type Pending = { id: number; context: number; resolve: (status: number, body: unknown) => void; aborted: boolean };

let pending: Pending[];
let nextId: number;

beforeEach(() => {
  resetStore();
  pending = [];
  nextId = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { context: { cook_minutes: number } };
      return new Promise((resolve) => {
        const entry: Pending = { id: nextId++, context: body.context.cook_minutes, aborted: false, resolve: (status, json) => resolve(new Response(JSON.stringify(json), { status })) };
        // The browser's abort does NOT always stop an answer already on its way: a
        // reply that has arrived (or is being parsed) when the request is abandoned
        // still reaches the code. So an abandoned request here keeps its promise and
        // can still be answered — the store must ignore it by identity, not by luck.
        init?.signal?.addEventListener("abort", () => {
          entry.aborted = true;
        });
        pending.push(entry);
      });
    }),
  );
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

/** A small seeded generator (mulberry32) — reproducible from the seed in the failure message. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const ok = (id: number) => ({ recommendations: [recipe({ title: `R${id}` })], session_id: `s${id}`, nutrition_is_estimate: true, insufficient_inventory: false, constraints: {}, model: "m" });
const bad = { error: { code: "upstream_error", message: "boom" } };

describe("the request store — random interleavings", () => {
  it.each(Array.from({ length: 60 }, (_, n) => n + 1))("seed %i", async (seed) => {
    const next = rng(seed);
    let newest: { id: number; settled: "success" | "failure" | null } | null = null;
    const started = new Map<number, "success" | "failure" | null>(); // fetch id → how it ended (null = unanswered)

    for (let step = 0; step < 40; step++) {
      const op = next();
      const before = pending.length;
      if (op < 0.3) {
        void run("u1", cookContext({ cook_minutes: 10 + Math.floor(next() * 3) })); // a few distinct questions
      } else if (op < 0.4) {
        retry("u1");
      } else if (pending.length > 0) {
        // Answer ANY request that has not been answered — including ones that were abandoned long ago.
        const open = pending.filter((p) => !started.has(p.id));
        if (open.length > 0) {
          const target = open[Math.floor(next() * open.length)];
          const fails = next() < 0.5;
          started.set(target.id, fails ? "failure" : "success");
          target.resolve(fails ? 502 : 200, fails ? bad : ok(target.id));
        }
      }
      await tick();
      await tick();

      // Which fetch is the newest request now? The last one started and not aborted.
      const live = pending.filter((p) => !p.aborted);
      const latest = live.at(-1) ?? null;
      if (pending.length > before && latest) newest = { id: latest.id, settled: null };
      if (!latest) continue;
      const outcome = started.get(latest.id) ?? null;
      const snap = getSnapshot();
      const where = `seed ${seed}, step ${step}, newest fetch #${latest.id} (${outcome ?? "running"})`;

      if (outcome === null) {
        expect(["loading", "locating"], where).toContain(snap.request.kind);
      } else if (outcome === "success") {
        expect(snap.request.kind, where).toBe("idle");
        expect(snap.session?.session_id, where).toBe(`s${latest.id}`);
      } else {
        expect(snap.request.kind, where).toBe("error");
      }
      // Never a failure next to a newer success.
      if (snap.request.kind === "error") expect(outcome, where).toBe("failure");
    }
    void newest;
  });
});
