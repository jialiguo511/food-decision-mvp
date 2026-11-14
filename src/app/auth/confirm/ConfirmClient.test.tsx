// @vitest-environment jsdom
//
// The confirmation page. What matters: opening the link does nothing but show a button (so a mail
// scanner or preview that loads the page cannot use the token up), the secret leaves the address
// bar at once, and only a tap sends it — in a POST body, to our own route.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import ConfirmClient from "./ConfirmClient";

const HASH = "h".repeat(56);
let container: HTMLDivElement;
let root: Root;
const assign = vi.fn();
const replace = vi.fn();
const fetchMock = vi.fn();
const text = () => container.textContent ?? "";
const button = () => [...container.querySelectorAll("button")].find((b) => /Sign in|Signing in/.test(b.textContent ?? ""));
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function open(url: string) {
  window.history.replaceState(null, "", url);
  vi.stubGlobal("location", { href: new URL(url, "https://app.example").href, assign, replace, origin: "https://app.example" });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ConfirmClient />));
}
function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}
const tap = async () => { await act(async () => { button()!.click(); await new Promise((r) => setTimeout(r, 0)); }); };

beforeEach(() => {
  assign.mockClear();
  replace.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("opening the link", () => {
  it("shows a confirm button and sends NOTHING — an email scanner that opens the link cannot use the token", async () => {
    open(`/auth/confirm#token_hash=${HASH}&type=email`);
    await flush();
    expect(button()).toBeDefined();
    expect(text()).toMatch(/Finish signing in/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("takes the secret out of the address bar and history straight away", async () => {
    const scrub = vi.spyOn(window.history, "replaceState");
    open(`/auth/confirm#token_hash=${HASH}&type=email`);
    await flush();
    // The last history write left an address with no fragment and no query.
    expect(scrub).toHaveBeenLastCalledWith(null, "", "/auth/confirm");
    expect(document.body.innerHTML).not.toContain(HASH);
    scrub.mockRestore();
  });

  it("explains that the Gmail app signs you in inside Gmail's browser, not your own", async () => {
    open(`/auth/confirm#token_hash=${HASH}&type=email`);
    await flush();
    expect(text()).toMatch(/Gmail/);
    expect(text()).toMatch(/type the code/i);
  });

  it("a link with no token (an app cut it off, or it was opened before) points to the code", async () => {
    open("/auth/confirm");
    await flush();
    expect(button()).toBeUndefined();
    expect(text()).toMatch(/incomplete/i);
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it("a link whose type is another flow (recovery) is treated as incomplete", async () => {
    open(`/auth/confirm#token_hash=${HASH}&type=recovery`);
    await flush();
    expect(button()).toBeUndefined();
  });

  it("an older-style redirect (?code=…) is handed to /auth/callback with only code and next", async () => {
    open("/auth/confirm?code=abc&next=/saved&evil=1");
    await flush();
    expect(replace).toHaveBeenCalledWith("/auth/callback?code=abc&next=%2Fsaved");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("tapping the button", () => {
  it("POSTs the token in the body to our own route — never in a URL — and loads the destination the server returns", async () => {
    respond(200, { ok: true, next: "/today" });
    open(`/auth/confirm#token_hash=${HASH}&type=signup`);
    await flush();
    await tap();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/auth/confirm/verify");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.cache).toBe("no-store");
    expect(JSON.parse(init.body)).toEqual({ token_hash: HASH, type: "signup", next: null });
    expect(assign).toHaveBeenCalledWith("/today");
  });

  it("a double tap is one request", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    open(`/auth/confirm#token_hash=${HASH}&type=email`);
    await flush();
    await act(async () => { button()!.click(); button()!.click(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => resolve(new Response(JSON.stringify({ ok: true, next: "/today" }), { status: 200 })));
  });

  it.each(["https://evil.example", "//evil.example", 5, undefined])("will not follow a destination that is not an in-site path (%s)", async (next) => {
    respond(200, { ok: true, next });
    open(`/auth/confirm#token_hash=${HASH}&type=email`);
    await flush();
    await tap();
    expect(assign).not.toHaveBeenCalled();
  });

  it("a used or expired token says so, offers sign-in, and cannot be tried again", async () => {
    respond(400, { ok: false, reason: "invalid" });
    open(`/auth/confirm#token_hash=${HASH}&type=email`);
    await flush();
    await tap();
    expect(text()).toMatch(/already been used or has expired/);
    expect(button()).toBeUndefined();
    expect(container.querySelector('a[href="/login"]')).not.toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("a busy server or lost connection keeps the button, so the same link can be tried again", async () => {
    respond(429, { ok: false, reason: "rate" });
    open(`/auth/confirm#token_hash=${HASH}&type=email`);
    await flush();
    await tap();
    expect(text()).toMatch(/Too many attempts/);
    expect(button()).toBeDefined();
    fetchMock.mockRejectedValue(new Error("offline"));
    await tap();
    expect(text()).toMatch(/Couldn't reach the server/);
    expect(button()).toBeDefined();
    respond(200, { ok: true, next: "/today" });
    await tap();
    expect(assign).toHaveBeenCalledWith("/today");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
