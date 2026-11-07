// @vitest-environment jsdom
//
// The carousel's picture behaviour as it really runs — real RecipeImage, real
// store, real context — with only the network and IntersectionObserver standing
// in. The IntersectionObserver here NEVER fires, which is what a card inside a
// horizontal scroller looks like to the viewport observer until it is actually
// swiped into view; so anything that loads is loading because of the carousel's
// own rule, not because the viewport said so.

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetImageStore } from "./imageStore";
import RecipeImage from "./RecipeImage";
import { ActiveSlideContext } from "./results/useMediaWanted";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class SilentObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const generated = (n: number) => ({ source: "generated", url: `https://img/${n}.webp` });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = (node: ReactNode) => act(() => root.render(node));
const states = () => [...container.querySelectorAll("figure")].map((f) => f.getAttribute("data-image-state"));
const requested = () => fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)).index as number);

const cards = (active: number | null) => (
  <ActiveSlideContext.Provider value={active}>
    {[0, 1, 2].map((i) => (
      <RecipeImage key={i} target={{ session_id: "s1", index: i }} size="large" slot={i} />
    ))}
  </ActiveSlideContext.Provider>
);

beforeEach(() => {
  resetImageStore();
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => json(generated(JSON.parse(String(init.body)).index)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IntersectionObserver", SilentObserver);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("carousel loading rule — the card on screen and the one next to it", () => {
  it("loads the first card, and the next, with no scrolling — the third waits", async () => {
    await render(cards(0));
    await flush();
    expect(requested().sort()).toEqual([0, 1]);
    expect(states()).toEqual(["ready", "ready", "waiting"]);
  });

  it("swiping to the second card starts the third BEFORE the user gets there", async () => {
    await render(cards(0));
    await flush();
    await render(cards(1));
    await flush();
    expect(requested().sort()).toEqual([0, 1, 2]);
    expect(states()).toEqual(["ready", "ready", "ready"]);
  });

  it("going back and forth never asks again (no repeated paid generation)", async () => {
    await render(cards(0));
    await flush();
    for (const active of [1, 2, 1, 0, 1, 2, 0]) {
      await render(cards(active));
      await flush();
    }
    expect(requested().sort()).toEqual([0, 1, 2]);
  });

  it("outside a carousel (Saved) a card with no slot and no viewport signal does not fetch", async () => {
    await render(<RecipeImage target={{ saved_id: "r1" }} size="thumbnail" />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(states()).toEqual(["waiting"]);
  });
});

describe("remounting a card", () => {
  it("shows the remembered picture immediately and makes no request", async () => {
    await render(cards(0));
    await flush();
    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockClear();
    await render(cards(0));
    expect(states()).toEqual(["ready", "ready", "waiting"]); // already on the first render
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a mount while the first request is still running joins it instead of starting another", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (release = r)));
    await render(<ActiveSlideContext.Provider value={0}><RecipeImage target={{ session_id: "s1", index: 0 }} size="large" slot={0} /></ActiveSlideContext.Provider>);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render(<ActiveSlideContext.Provider value={0}><RecipeImage target={{ session_id: "s1", index: 0 }} size="large" slot={0} /></ActiveSlideContext.Provider>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => release(json(generated(0))));
    await flush();
    expect(states()).toEqual(["ready"]);
  });
});

describe("failure states are distinct, keep the frame, and recover", () => {
  const one = (active = 0) => (
    <ActiveSlideContext.Provider value={active}>
      <RecipeImage target={{ session_id: "s1", index: 0 }} size="large" slot={0} />
    </ActiveSlideContext.Provider>
  );
  const tryAgain = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Try again");
  const figure = () => container.querySelector("figure")!;

  it("a failed generation says so, offers Try again, and the retry can succeed", async () => {
    fetchMock.mockResolvedValueOnce(json({ url: null, reason: "generation_failed" }));
    await render(one());
    await flush();
    expect(figure().getAttribute("data-image-state")).toBe("failed");
    expect(figure().getAttribute("data-image-cause")).toBe("generation");
    await act(async () => tryAgain()!.click());
    await flush();
    expect(figure().getAttribute("data-image-state")).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a failed request is a different cause from a failed generation", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    await render(one());
    await flush();
    expect(figure().getAttribute("data-image-cause")).toBe("request");
  });

  it("'no photo' is final: no retry button", async () => {
    fetchMock.mockResolvedValueOnce(json({ url: null, reason: "no_image" }));
    await render(one());
    await flush();
    expect(figure().getAttribute("data-image-state")).toBe("none");
    expect(tryAgain()).toBeUndefined();
  });

  it("a picture that arrives but will not display is its own state, and retry asks the server again", async () => {
    await render(one());
    await flush();
    expect(figure().getAttribute("data-image-state")).toBe("ready");
    await act(async () => container.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(figure().getAttribute("data-image-state")).toBe("failed");
    expect(figure().getAttribute("data-image-cause")).toBe("display");
    await act(async () => tryAgain()!.click());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(figure().getAttribute("data-image-state")).toBe("ready");
  });

  it("every state renders the same frame and caption line, so nothing shifts", async () => {
    const shape = () => [figure().querySelector("div")!.className.match(/aspect-\S+/)![0], figure().querySelectorAll("figcaption").length];
    fetchMock.mockResolvedValueOnce(json({ url: null, reason: "generation_failed" }));
    await render(one(-5)); // not wanted yet: waiting
    const waiting = shape();
    await render(one(0));
    await flush();
    const failed = shape();
    await act(async () => tryAgain()!.click());
    await flush();
    expect([waiting, failed, shape()]).toEqual([waiting, waiting, waiting]);
  });
});
