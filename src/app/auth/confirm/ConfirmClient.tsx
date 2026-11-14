"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { confirmFailureMessage, parseConfirmFragment, type ConfirmFailure, type ConfirmRequest } from "@/lib/confirmToken";

/**
 * Where the emailed link lands. Opening it signs nobody in: the page reads the token from the
 * address's fragment, removes it from the address bar and history at once, and waits. Only the
 * person's tap on the button POSTs it (/auth/confirm/verify). So a mail scanner, link preview or
 * prefetch that merely opens the link cannot use it up; and because no cookie from the browser that
 * asked for the email is involved, it works in Gmail's built-in browser, Safari and Chrome alike.
 * The session is created in the browser that taps the button.
 */
export default function ConfirmClient() {
  const [stage, setStage] = useState<"reading" | "ready" | "missing" | "working" | "failed">("reading");
  const [failure, setFailure] = useState<ConfirmFailure>("invalid");
  // The token lives only here: not in state (so not in a re-render), not in storage, not in the URL.
  const request = useRef<ConfirmRequest | null>(null);
  const read = useRef(false);
  // A ref, not the stage: two taps in the same frame both see the old state.
  const inFlight = useRef(false);

  useEffect(() => {
    if (read.current) return; // Strict Mode runs effects twice; the fragment is already gone the 2nd time.
    read.current = true;
    const url = new URL(window.location.href);

    // An older link (the one-time-code redirect Supabase sent before this page existed) still has
    // to work in the browser that asked. Hand it on, carrying only the two parameters it uses.
    const code = url.searchParams.get("code");
    if (code) {
      const forward = new URLSearchParams({ code });
      const next = url.searchParams.get("next");
      if (next) forward.set("next", next);
      window.location.replace(`/auth/callback?${forward.toString()}`);
      return;
    }

    const parsed = parseConfirmFragment(url.hash);
    // Scrub the secret from the address bar and the history entry before anything else can see it.
    if (url.hash || url.search) window.history.replaceState(null, "", url.pathname);
    request.current = parsed;
    setStage(parsed ? "ready" : "missing");
  }, []);

  async function confirm() {
    const pending = request.current;
    if (!pending || inFlight.current) return;
    inFlight.current = true;
    setStage("working");
    try {
      const res = await fetch("/auth/confirm/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token_hash: pending.tokenHash, type: pending.type, next: pending.next }),
        credentials: "same-origin",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; next?: unknown; reason?: ConfirmFailure } | null;
      // The destination comes back from the server, which has already restricted it to a path on this
      // site; check the shape again here rather than trust whatever answered.
      if (res.ok && data?.ok && typeof data.next === "string" && data.next.startsWith("/") && !data.next.startsWith("//")) {
        request.current = null;
        // A full page load: the session cookie is set and everything in memory from before is dropped.
        window.location.assign(data.next);
        return;
      }
      const reason = data?.reason ?? "invalid";
      // A used or expired token cannot work again; a busy or unreachable server might, on a retry.
      if (reason === "invalid" || reason === "refused") request.current = null;
      setFailure(reason);
    } catch {
      setFailure("network");
    }
    inFlight.current = false;
    setStage("failed");
  }

  const retryable = failure === "rate" || failure === "network";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-3 w-fit rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{BRAND.stage}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{BRAND.name}?</h1>

      {stage === "reading" && <p className="mt-8 text-sm text-muted">One moment…</p>}

      {(stage === "ready" || stage === "working" || (stage === "failed" && retryable)) && (
        <div className="mt-8 rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">Finish signing in</h2>
          <p className="mt-2 text-sm">Tap the button to sign in on this device and in this browser. If you didn&apos;t ask for this, close the page — nothing has happened.</p>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={stage === "working"}
            className="mt-4 w-full rounded-2xl bg-accent py-3.5 font-semibold text-white disabled:opacity-60"
          >
            {stage === "working" ? "Signing in…" : "Sign in"}
          </button>
          {stage === "failed" && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {confirmFailureMessage(failure)}
            </p>
          )}
          <p className="mt-4 text-xs text-muted">
            Opened this from the Gmail app? You&apos;ll be signed in inside Gmail&apos;s own browser, not in Safari or Chrome. To sign in in your own browser, go back to the sign-in page
            there and type the code from the email.
          </p>
        </div>
      )}

      {(stage === "missing" || (stage === "failed" && !retryable)) && (
        <div role="alert" className="mt-8 rounded-2xl border border-line bg-card p-5 text-sm">
          <p>
            {stage === "missing"
              ? "This link is incomplete — some email apps cut off the end of a link, or it was already opened. Go back to sign-in and type the code from the email instead; it works in any browser."
              : confirmFailureMessage(failure)}
          </p>
          <Link href="/login" className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent">
            Back to sign-in
          </Link>
        </div>
      )}

      <noscript>
        <p className="mt-8 text-sm">This page needs JavaScript to finish signing in. Otherwise go back to sign-in and type the code from the email.</p>
      </noscript>
    </div>
  );
}
