// @vitest-environment jsdom
//
// The request/store ownership pattern as it really runs: a React tree that reads
// the store through useRecommend is mounted, a submit is tapped, the tree is
// UNMOUNTED (the user taps another tab) and mounted again (back to Home), and the
// network is only ever hit once per explicit submit. The component under test is
// a thin stand-in for HomeFlow — same hook, same owner, same "request starts only
// from a click handler" rule — so what is exercised is the real store and the
// real useSyncExternalStore subscription, not a reducer transition.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cookContext } from "@/test/cookFixtures";
import { recipe } from "@/test/savedFixtures";
import type { ActiveSession } from "@/lib/types";

vi.mock("./actions", () => ({
  chooseRecommendation: vi.fn(async (_id: string, index: 0 | 1 | 2) => ({ ok: true, chosenIndex: index })),
  rescoreSession: vi.fn(),
}));
vi.mock("@/lib/location", () => ({
  LocationError: class extends Error {},
  requestLocation: vi.fn(async () => ({ latitude: 1, longitude: 2 })),
}));

import { setRequestLogSink } from "@/lib/recommend/requestLog";
import { resetStore } from "./recommendStore";
import { useRecommend } from "./useRecommend";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STALE: ActiveSession = { session_id: "old", context: cookContext(), recommendations: [recipe({ title: "Old Dish" })] as ActiveSession["recommendations"] };
const FAST = cookContext({ cook_minutes: 15 });
const SLOW = cookContext({ cook_minutes: 45 });

/** Stand-in for HomeFlow: reads the request through the hook; submits only from a click. */
function Home({ contexts }: { contexts: Record<string, ReturnType<typeof cookContext>> }) {
  const { session, request, run } = useRecommend("u1", { session: STALE, chosenIndex: null });
  return (
    <div>
      <p data-testid="status">{request.kind === "idle" ? "idle" : `${request.kind}:${request.requestId}`}</p>
      <p data-testid="cards">{session ? session.recommendations.map((r) => ("title" in r ? r.title : "")).join(",") : "none"}</p>
      {Object.entries(contexts).map(([name, context]) => (
        <button key={name} data-testid={name} onClick={() => void run(context)}>
          {name}
        </button>
      ))}
    </div>
  );
}

let container: HTMLElement;
let root: Root;
let pending: { resolve: (body: unknown, ok?: boolean) => void; signal: AbortSignal | undefined; headers: Record<string, string> }[];
let fetchSpy: ReturnType<typeof vi.fn>;
let logs: string[];

const mount = () => {
  root = createRoot(container);
  act(() => root.render(<Home contexts={{ fast: FAST, slow: SLOW }} />));
};
const unmount = () => act(() => root.unmount());
const tap = (id: string) => act(() => void container.querySelector<HTMLButtonElement>(`[data-testid=${id}]`)!.click());
const text = (id: string) => container.querySelector(`[data-testid=${id}]`)!.textContent;
const ok = (id: string, title: string) => ({ recommendations: [recipe({ title })], session_id: id, saved: { recipeIndexes: [], placeIds: [] } });
const settle = async (index: number, body: unknown) => {
  await act(async () => {
    pending[index].resolve(body);
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  resetStore();
  container = document.createElement("div");
  document.body.append(container);
  pending = [];
  logs = [];
  setRequestLogSink((line) => logs.push(line));
  fetchSpy = vi.fn(
    (_url: string, init: { signal?: AbortSignal; headers: Record<string, string> }) =>
      new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        pending.push({ signal: init.signal, headers: init.headers, resolve: (body, ok = true) => resolve({ ok, status: ok ? 200 : 504, json: async () => body }) });
      }),
  );
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  setRequestLogSink(null);
  vi.unstubAllGlobals();
});

describe("one explicit submit = at most one model request, whatever Home does", () => {
  it("submit → Home unmounts → Home remounts: still one request, the SAME one, still loading; its result then appears", async () => {
    mount();
    tap("fast");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const loading = text("status");
    expect(loading).toMatch(/^loading:/);

    unmount(); // bottom nav → Me
    expect(pending[0].signal?.aborted).toBe(false); // navigation never cancels the request
    mount(); // bottom nav → Home

    expect(fetchSpy).toHaveBeenCalledTimes(1); // a remount is not intent
    expect(text("status")).toBe(loading); // same requestId, not a new loading cycle
    expect(text("cards")).toBe("none"); // not the old session passed off as the answer

    await settle(0, ok("new", "New Dish"));
    expect(text("status")).toBe("idle");
    expect(text("cards")).toBe("New Dish");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("submit → Home unmounts → the request finishes while away → remount shows the result at once, no second request", async () => {
    mount();
    tap("fast");
    unmount();
    await settle(0, ok("new", "New Dish"));
    mount();
    expect(text("status")).toBe("idle"); // no loading cycle
    expect(text("cards")).toBe("New Dish");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a request that failed while away comes back as its error, not restarted", async () => {
    mount();
    tap("fast");
    unmount();
    await act(async () => {
      pending[0].resolve({ error: { code: "upstream_timeout", message: "slow" } }, false);
    });
    mount();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(text("status")).toMatch(/^error:/);
    expect(text("cards")).toBe("none"); // the error, not the older cards
  });

  it("a double tap on the same button is one request", () => {
    mount();
    tap("fast");
    tap("fast");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("the browser sends its request id, so the server log can be matched to this tap", () => {
    mount();
    tap("fast");
    const id = text("status")!.split(":")[1];
    expect(pending[0].headers["X-Request-Id"]).toBe(id);
  });
});

describe("a newer request is never overwritten by an older one", () => {
  it("submit abc → submit def (changed answers) → abc resolves last → def is still current", async () => {
    mount();
    tap("fast"); // abc
    const abc = text("status")!.split(":")[1];
    tap("slow"); // def — different answers: supersedes
    const def = text("status")!.split(":")[1];
    expect(def).not.toBe(abc);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(pending[0].signal?.aborted).toBe(true); // abc was cancelled on purpose

    // Even if abc's response had slipped through, it must not land:
    await settle(0, ok("abc-session", "ABC Dish"));
    expect(text("cards")).toBe("none");
    expect(text("status")).toBe(`loading:${def}`);

    await settle(1, ok("def-session", "DEF Dish"));
    expect(text("cards")).toBe("DEF Dish");
    expect(text("status")).toBe("idle");
  });

  it("the trace says what happened: start, abort(superseded), start, response, stored", async () => {
    mount();
    tap("fast");
    tap("slow");
    await settle(1, ok("def-session", "DEF Dish"));
    const events = logs.map((l) => l.split(" ").filter(Boolean)[1]);
    expect(events).toEqual(expect.arrayContaining(["start", "abort", "response", "stored"]));
    expect(logs.filter((l) => /\bstart\b/.test(l))).toHaveLength(2);
    expect(logs.some((l) => /abort.*reason=superseded/.test(l))).toBe(true);
  });

  it("a remount while loading is logged as attaching to the existing request, not starting one", () => {
    mount();
    tap("fast");
    unmount();
    mount();
    expect(logs.filter((l) => /\bstart\b/.test(l))).toHaveLength(1);
    expect(logs.some((l) => /mounted.*state=loading/.test(l))).toBe(true);
    expect(logs.some((l) => /reused.*why=remount/.test(l))).toBe(true);
  });
});
