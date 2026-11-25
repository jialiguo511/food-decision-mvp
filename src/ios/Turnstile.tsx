"use client";

// iOS build stand-in for src/components/Turnstile.tsx (same exports). Cloudflare won't issue a real
// token to capacitor://localhost, so the check runs on our real domain in Apple's authentication
// sheet and hands its one-time token back (the sign-in check bridge — src/lib/appCheck.ts,
// ios/App/App/WebAuthPlugin.swift). The token is never shown or logged.
import { registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { readCallback } from "@/lib/appCheck";
import { API_BASE } from "@/ios/config";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

type WebAuthPlugin = { start(o: { url: string; allowedHost: string }): Promise<{ url: string }> };
const WebAuth = registerPlugin<WebAuthPlugin>("WebAuth");

function newState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const [state, setState] = useState<"idle" | "open" | "done" | "error">("idle");

  // A token is single-use: after each attempt the page bumps resetKey and the check is needed again.
  useEffect(() => {
    setState("idle");
    onToken(null);
  }, [resetKey, onToken]);

  async function run() {
    setState("open");
    const expected = newState();
    try {
      const { url } = await WebAuth.start({ url: `${API_BASE}/app/check?state=${expected}`, allowedHost: new URL(API_BASE).host });
      const result = readCallback(url, expected);
      if (!result.ok) return setState("error");
      onToken(result.token);
      setState("done");
    } catch (error) {
      setState((error as { code?: unknown })?.code === "canceled" ? "idle" : "error");
    }
  }

  if (state === "done") {
    return (
      <p className="flex min-h-11 items-center gap-2 rounded-2xl border border-sage/30 bg-sage-soft px-4 text-sm text-sage" role="status">
        <span aria-hidden>✓</span> Quick check done
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => void run()} disabled={state === "open"} className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-line bg-card px-4 text-sm font-semibold disabled:opacity-60">
        {state === "open" ? "Checking…" : "Quick check first (one second)"}
      </button>
      {state === "error" && (
        <p role="alert" className="text-sm text-red-700">
          The check didn&apos;t finish. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
