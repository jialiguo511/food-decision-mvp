// @vitest-environment jsdom
//
// Sign-in works in ANY browser: after the email is requested the page offers the one-time
// code, which needs no cookie from the browser that asked (unlike the link, which Gmail's
// built-in browser breaks). Supabase and navigation are stand-ins; what is checked is what
// the page sends and shows.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signInWithOtp = vi.fn(async (arg: unknown) => ({ arg, error: null as null | { message: string; status?: number; code?: string } }));
const verifyOtp = vi.fn(async (arg: unknown) => ({ arg, error: null as null | { message: string; status?: number; code?: string } }));
const signInWithPassword = vi.fn(async (arg: unknown) => ({ arg, error: null as null | { message: string; status?: number; code?: string } }));
let search = "";

vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true, SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "x".repeat(30) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithOtp, verifyOtp, signInWithPassword } }) }));

import LoginPage from "./page";

let container: HTMLDivElement;
let root: Root;
const assign = vi.fn();
const text = () => container.textContent ?? "";
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
function type(selector: string, value: string) {
  const el = container.querySelector(selector) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const submit = (selector: string) => act(async () => { (container.querySelector(selector) as HTMLFormElement).requestSubmit(); await new Promise((r) => setTimeout(r, 0)); });

async function requestEmail() {
  type("#login-email", "friend@example.com");
  await submit("form");
}

beforeEach(() => {
  search = "";
  signInWithOtp.mockClear();
  verifyOtp.mockClear();
  signInWithPassword.mockClear();
  signInWithPassword.mockResolvedValue({ arg: null, error: null });
  verifyOtp.mockResolvedValue({ arg: null, error: null });
  assign.mockClear();
  vi.stubGlobal("location", { ...window.location, origin: "http://localhost:3000", assign });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<LoginPage />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("sign-in page", () => {
  it("asks for the email first, with no code box yet", () => {
    expect(container.querySelector("#login-email")).not.toBeNull();
    expect(container.querySelector("#login-code")).toBeNull();
  });

  it("asks for the link to land on the confirmation page, not the old callback", async () => {
    await requestEmail();
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: "http://localhost:3000/auth/confirm" }) }));
  });

  it("after the email is sent, leads with the code (it signs in HERE — browser or iOS app) and says the link may open elsewhere", async () => {
    await requestEmail();
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
    expect(container.querySelector("#login-code")).not.toBeNull();
    expect(text()).toMatch(/sign-in code/i);
    expect(text()).toMatch(/signs you in\s+inside whichever app opens it/i);
    expect(text()).toMatch(/Not spam/);
    expect(container.querySelector("#login-code")?.getAttribute("autocomplete")).toBe("one-time-code");
  });

  it("signs in with the typed code — spaces and dashes tolerated — and loads the app", async () => {
    await requestEmail();
    type("#login-code", "123 456");
    await submit('form:has(#login-code)');
    expect(verifyOtp).toHaveBeenCalledWith({ email: "friend@example.com", token: "123456", type: "email" });
    expect(assign).toHaveBeenCalledWith("/today");
  });

  it("does not submit a code that is too short, and sends nothing", async () => {
    await requestEmail();
    type("#login-code", "12345");
    const button = [...container.querySelectorAll("button")].find((b) => /Sign in with code/.test(b.textContent ?? ""))!;
    expect(button.disabled).toBe(true);
    await submit('form:has(#login-code)');
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("a wrong or expired code says so, plainly, and stays on the page", async () => {
    verifyOtp.mockResolvedValue({ arg: null, error: { message: "Token has expired or is invalid", code: "otp_expired", status: 403 } });
    await requestEmail();
    type("#login-code", "654321");
    await submit('form:has(#login-code)');
    await flush();
    expect(text()).toMatch(/That code didn't work/);
    expect(text()).not.toMatch(/Token has expired/);
    expect(assign).not.toHaveBeenCalled();
  });

  it("a failed link (?error=link_expired) points to the code, which works anywhere", () => {
    act(() => root.unmount());
    search = "error=link_expired";
    root = createRoot(container);
    act(() => root.render(<LoginPage />));
    expect(text()).toMatch(/didn't work/);
    expect(text()).toMatch(/code/i);
  });
});

describe("password sign-in (App Store review account)", () => {
  const openPassword = () =>
    act(async () => {
      const b = [...container.querySelectorAll("button")].find((x) => x.textContent === "Use a password instead")!;
      b.click();
      await new Promise((r) => setTimeout(r, 0));
    });

  it("the email code stays the default; the password form is one tap away", async () => {
    expect(container.querySelector("#pw-password")).toBeNull();
    await openPassword();
    expect(container.querySelector("#pw-password")?.getAttribute("type")).toBe("password");
    expect(container.querySelector("#pw-password")?.getAttribute("autocomplete")).toBe("current-password");
  });

  it("uses Supabase's own signInWithPassword and loads the app", async () => {
    await openPassword();
    type("#pw-email", " reviewer@example.com ");
    type("#pw-password", "a-long-password");
    await submit('form[aria-label="Sign in with a password"]');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "reviewer@example.com", password: "a-long-password" });
    expect(signInOk()).toBe(true);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("a wrong password never says whether the account exists, and doesn't navigate", async () => {
    signInWithPassword.mockResolvedValueOnce({ arg: null, error: { message: "Invalid login credentials", status: 400, code: "invalid_credentials" } });
    await openPassword();
    type("#pw-email", "someone@example.com");
    type("#pw-password", "nope");
    await submit('form[aria-label="Sign in with a password"]');
    expect(text()).toMatch(/email and password didn't work/);
    expect(assign).not.toHaveBeenCalled();
  });
});

function signInOk() {
  return assign.mock.calls.some((c) => c[0] === "/today");
}
