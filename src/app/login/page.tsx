"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import SetupNotice from "@/components/SetupNotice";
import Turnstile, { TURNSTILE_SITE_KEY } from "@/components/Turnstile";
import { BRAND } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/env";
import { callbackErrorMessage, cleanCode, isPlausibleCode, resendSecondsLeft, sendLinkErrorMessage, verifyCodeErrorMessage } from "@/lib/loginErrors";
import { createClient } from "@/lib/supabase/client";

/**
 * Email sign-in with no password to store, reset, or leak. Supabase emails ONE message with two
 * ways in: a one-time link that lands on /auth/callback (works only in the browser that asked —
 * Gmail's and WeChat's built-in browsers are not that browser), and a one-time code typed here,
 * which works in any browser or on any device. The code needs {{ .Token }} in the Supabase
 * "Magic Link" email template (docs/RELEASE.md §6.7).
 */
export default function LoginPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  // useSearchParams needs a Suspense boundary in a statically rendered page.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const linkNotice = callbackErrorMessage(params.get("error"));
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [code, setCode] = useState("");
  const [codeState, setCodeState] = useState<"idle" | "checking" | "error">("idle");
  const [codeError, setCodeError] = useState("");

  // Ticks only while the resend timer is running.
  const waiting = state === "sent" && resendSecondsLeft(sentAt, now) > 0;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [waiting]);

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (state === "sending") return;
    if (TURNSTILE_SITE_KEY && !captcha) {
      // The check sits just above the button and shows its own failure and retry if it cannot run.
      setError("The check above has to pass before we can send the link.");
      setState("error");
      return;
    }
    setState("sending");
    // window.location.origin is always the domain the user is actually on —
    // localhost in dev, the real production origin, or a preview deploy's own
    // origin — so the redirect never depends on an env var being set (or scoped)
    // correctly at deploy time. (A prior version preferred NEXT_PUBLIC_SITE_URL,
    // which sent every Preview sign-in back to production.) The destination must
    // also be allowed in Supabase → Authentication → URL Configuration.
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        ...(captcha ? { captchaToken: captcha } : {}),
      },
    });
    // A token is single-use whatever happened.
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    if (error) {
      setError(sendLinkErrorMessage(error));
      setState("error");
    } else {
      setSentAt(Date.now());
      setNow(Date.now());
      setCode("");
      setCodeState("idle");
      setState("sent");
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (codeState === "checking" || !isPlausibleCode(code)) return;
    setCodeState("checking");
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: cleanCode(code), type: "email" });
    if (error) {
      setCodeError(verifyCodeErrorMessage(error));
      setCodeState("error");
      return;
    }
    // A full page load, not a client navigation: the session cookie is set, and everything in
    // memory from before sign-in is dropped (the same rule Reset my data relies on).
    window.location.assign("/today");
  }

  const left = state === "sent" ? resendSecondsLeft(sentAt, now) : 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-3 w-fit rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">{BRAND.stage}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{BRAND.name}?</h1>
      <p className="mt-2 text-muted">{BRAND.tagline}</p>

      {linkNotice && state !== "sent" && (
        <p role="alert" className="mt-6 rounded-2xl border border-line bg-card p-4 text-sm">
          {linkNotice}
        </p>
      )}

      {state === "sent" ? (
        <div className="mt-8 rounded-2xl border border-line bg-card p-5" role="status">
          <p className="text-sm">
            We emailed <span className="font-medium">{email}</span> a sign-in link and a code. Type the code below — it works in any browser, including the one built
            into Gmail — or tap the link in the same browser you are using now.
          </p>
          <form onSubmit={submitCode} className="mt-4 space-y-2">
            <label htmlFor="login-code" className="text-sm font-semibold">
              Code from the email
            </label>
            <input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={14}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setCodeState("idle");
              }}
              disabled={codeState === "checking"}
              aria-invalid={codeState === "error" ? true : undefined}
              placeholder="123456"
              className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-lg tracking-widest outline-none focus:border-accent disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={codeState === "checking" || !isPlausibleCode(code)}
              className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-white disabled:opacity-60"
            >
              {codeState === "checking" ? "Signing in…" : "Sign in with code"}
            </button>
            {codeState === "error" && (
              <p role="alert" className="text-sm text-red-700">
                {codeError}
              </p>
            )}
          </form>
          <p className="mt-3 text-xs text-muted">Nothing there? Look in spam. The email comes from our sign-in service, and can take a minute. Codes and links work once.</p>
          <div className="mt-4 flex flex-col gap-2">
            {TURNSTILE_SITE_KEY && <Turnstile onToken={setCaptcha} resetKey={captchaReset} />}
            <button
              type="button"
              onClick={() => void send()}
              disabled={left > 0 || (!!TURNSTILE_SITE_KEY && !captcha)}
              className="min-h-11 rounded-2xl border border-line bg-card px-4 text-sm font-semibold disabled:opacity-50"
            >
              {left > 0 ? `Send another code (${left}s)` : "Send another code"}
            </button>
            <button
              type="button"
              onClick={() => {
                setState("idle");
                setSentAt(null);
                setCode("");
                setCodeState("idle");
              }}
              className="min-h-11 text-sm text-accent"
            >
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="mt-8 space-y-3">
          <label htmlFor="login-email" className="sr-only">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-accent"
          />
          {TURNSTILE_SITE_KEY && <Turnstile onToken={setCaptcha} resetKey={captchaReset} />}
          <button
            type="submit"
            disabled={state === "sending"}
            className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-white disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {state === "error" && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p className="text-xs text-muted">
            No password. We email you a one-time code and link; signing in with a new address creates your account. By continuing you accept what&apos;s described in{" "}
            <Link href="/about" className="underline">
              About &amp; privacy
            </Link>
            .
          </p>
        </form>
      )}

      <div className="mt-8 flex flex-col gap-2 text-sm">
        <Link href="/demo" className="font-semibold text-accent">
          See an example first — no sign-in
        </Link>
        <Link href="/about" className="text-muted underline">
          About this beta, privacy and estimates
        </Link>
      </div>
    </div>
  );
}
