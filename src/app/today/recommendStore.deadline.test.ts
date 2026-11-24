// A request that never answers ends with an honest "took too long" (Try again), and "Stop" ends
// it at once — the spinner never runs forever.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookContext } from "@/test/cookFixtures";

vi.mock("./actions", () => ({ chooseRecommendation: vi.fn(), rescoreSession: vi.fn() }));
vi.mock("@/lib/location", () => ({ LocationError: class extends Error {}, requestLocation: vi.fn() }));

import { cancel, CLIENT_DEADLINE_MS, getSnapshot, resetStore, run, viewOf } from "./recommendStore";

let signals: AbortSignal[];
beforeEach(() => {
  vi.useFakeTimers();
  resetStore();
  signals = [];
  // A server that never answers; it only notices the browser giving up.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signals.push(signal);
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const view = () => viewOf(getSnapshot(), "u1", { session: null, chosenIndex: null });

describe("a request that never answers", () => {
  it("fails as a timeout at the client deadline, with the request aborted", async () => {
    const done = run("u1", cookContext());
    await vi.advanceTimersByTimeAsync(CLIENT_DEADLINE_MS - 1);
    expect(view().request.kind).toBe("loading");
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(signals[0].aborted).toBe(true);
    expect(view().request).toMatchObject({ kind: "error", error: { code: "upstream_timeout" } });
  });

  it("Stop aborts it at once and leaves no error and no request", async () => {
    const done = run("u1", cookContext());
    await vi.advanceTimersByTimeAsync(20_000);
    cancel("u1");
    await done;
    expect(signals[0].aborted).toBe(true);
    expect(view().request).toEqual({ kind: "idle" });
    // The deadline timer is gone with it: nothing fires later.
    await vi.advanceTimersByTimeAsync(CLIENT_DEADLINE_MS);
    expect(view().request).toEqual({ kind: "idle" });
  });

  it("Stop for another user does nothing", async () => {
    void run("u1", cookContext());
    await vi.advanceTimersByTimeAsync(1);
    cancel("u2");
    expect(view().request.kind).toBe("loading");
  });
});
