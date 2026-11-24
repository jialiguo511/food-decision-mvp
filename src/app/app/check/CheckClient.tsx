"use client";

import { useEffect, useState } from "react";
import Turnstile, { TURNSTILE_SITE_KEY } from "@/components/Turnstile";
import { callbackUrl, isValidState } from "@/lib/appCheck";
import { BRAND } from "@/lib/brand";

export default function CheckClient() {
  const [state, setState] = useState<string | null | undefined>(undefined);
  const [done, setDone] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  // Read from the URL after mount; an invalid state means this page wasn't opened by the app.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("state");
    setState(isValidState(value) ? value : null);
  }, []);

  function onToken(token: string | null) {
    if (!token || !state || done) return;
    setDone(true);
    // Hand the one-time token back to the app. The sheet closes on this navigation.
    window.location.replace(callbackUrl(state, token));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 pb-[max(3rem,env(safe-area-inset-bottom))] pt-[max(3rem,calc(env(safe-area-inset-top)+1rem))]">
      <h1 className="text-2xl font-semibold tracking-tight">Quick check</h1>
      {state === null ? (
        <p className="text-muted">This page only works when {BRAND.short} opens it. Close it and try signing in again.</p>
      ) : !TURNSTILE_SITE_KEY ? (
        <p className="text-muted">The check isn&apos;t set up on this server.</p>
      ) : done ? (
        <p className="text-muted">Done — returning to the app…</p>
      ) : (
        <>
          <p className="text-muted">A one-second check that you&apos;re a person, then you&apos;re back in the app to get your sign-in code.</p>
          {state && <Turnstile onToken={onToken} resetKey={resetKey} />}
          <button type="button" onClick={() => setResetKey((n) => n + 1)} className="min-h-11 text-sm font-semibold text-accent">
            Try the check again
          </button>
        </>
      )}
    </main>
  );
}
