// The picture request's memory. These are the properties that decide whether a
// remounted card pays again: one request in flight, settled answers kept, a
// failure NOT kept (so "Try again" is real) but capped.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetImage, imageKey, MAX_ATTEMPTS, peekImage, requestImage, resetImageStore, retriesLeft, toResult } from "./imageStore";

const T = { session_id: "s1", index: 1 };
const KEY = imageKey(T);
const generated = { source: "generated", url: "https://img/a.webp" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  resetImageStore();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe("requestImage — one paid request per card", () => {
  it("shares a single request between concurrent callers (a remount mid-flight must not start a second)", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)));
    const a = requestImage(T);
    const b = requestImage(T); // e.g. the same card mounted again while the first is running
    release(json(generated));
    expect(await a).toEqual({ status: "ready", result: generated });
    expect(await b).toEqual({ status: "ready", result: generated });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remembers a settled picture: coming back to the card makes no request at all", async () => {
    fetchMock.mockImplementation(async () => json(generated));
    await requestImage(T);
    expect(peekImage(KEY)).toEqual({ status: "ready", result: generated });
    await requestImage(T);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remembers 'nothing to show' too — it is an answer, not a failure", async () => {
    fetchMock.mockImplementation(async () => json({ url: null, reason: "no_image" }));
    expect(await requestImage(T)).toEqual({ status: "none", reason: "no_image" });
    await requestImage(T);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keys a Saved recipe and a session card separately", () => {
    expect(imageKey({ saved_id: "r1" })).toBe("saved:r1");
    expect(imageKey({ session_id: "s1", index: 2 })).toBe("s1:2");
  });
});

describe("failures are told apart, are not remembered as answers, and are capped", () => {
  it("a generation failure and a failed request are different causes", async () => {
    fetchMock.mockResolvedValueOnce(json({ url: null, reason: "generation_failed" }));
    expect(await requestImage(T)).toEqual({ status: "failed", cause: "generation" });
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    expect(await requestImage(T)).toEqual({ status: "failed", cause: "request" });
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    expect(await requestImage(T)).toEqual({ status: "failed", cause: "request" });
  });

  it("'Try again' really asks again, and a later success is kept", async () => {
    fetchMock.mockResolvedValueOnce(json({ url: null, reason: "generation_failed" })).mockResolvedValueOnce(json(generated));
    expect((await requestImage(T)).status).toBe("failed");
    expect(peekImage(KEY)).toBeUndefined();
    expect(await requestImage(T)).toEqual({ status: "ready", result: generated });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops after MAX_ATTEMPTS failures — a broken card cannot loop paid attempts", async () => {
    fetchMock.mockImplementation(async () => json({ url: null, reason: "generation_failed" }));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await requestImage(T);
    expect(retriesLeft(KEY)).toBe(0);
    expect(await requestImage(T)).toEqual({ status: "none", reason: "no_image" });
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("a 429 is a settled 'limit reached', not something to retry in a loop", async () => {
    fetchMock.mockImplementation(async () => new Response("{}", { status: 429 }));
    expect(await requestImage(T)).toEqual({ status: "none", reason: "limited" });
    await requestImage(T);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a picture the browser could not display is forgotten and counted, so the retry asks the server again", async () => {
    fetchMock.mockImplementation(async () => json(generated));
    await requestImage(T);
    forgetImage(KEY);
    expect(peekImage(KEY)).toBeUndefined();
    expect(retriesLeft(KEY)).toBe(MAX_ATTEMPTS - 1);
    await requestImage(T);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("toResult — the route's answer as a card can show it", () => {
  it("accepts a generated image and an attributed photo; nothing else", () => {
    expect(toResult({ url: "u", source: "generated" })).toEqual({ source: "generated", url: "u" });
    expect(toResult({ url: "u", photographerName: "A", photographerUrl: "p", sourceUrl: "s" })).toMatchObject({ source: "photo", url: "u" });
    expect(toResult({ url: "u" })).toBeNull(); // a photo without its required attribution is not shown
    expect(toResult({ url: null })).toBeNull();
    expect(toResult(null)).toBeNull();
  });
});
