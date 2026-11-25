"use client";

// Inside the bundled app the page's origin is capacitor://localhost, so the existing code's
// relative `fetch("/api/…")` calls must go to the backend, with the user's token instead of a
// cookie, and the app version. Installed once at startup; every other request is untouched.
import { API_BASE, APP_VERSION, UPDATE_REQUIRED } from "./config";
import { accessToken } from "./supabaseClient";

let installed = false;

export function installFetchBridge(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("/api/")) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = await accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-App-Version", APP_VERSION);
    const response = await original(API_BASE + url, { ...init, headers, credentials: "omit" });
    if (response.status === 426) window.dispatchEvent(new Event(UPDATE_REQUIRED));
    return response;
  };
}
