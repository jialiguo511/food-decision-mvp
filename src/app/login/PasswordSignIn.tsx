"use client";

// "Use a password instead" — Supabase's standard email + password sign-in, for an account that has a
// password (the App Store review account, created in the Supabase dashboard; docs/appstore/REVIEW_LOGIN.md).
// Regular users sign in with the emailed code and have no password, so this changes nothing for them.
// Same CAPTCHA (Turnstile) as the code path, Supabase's own rate limits, an ordinary user session
// under the same RLS. It never signs anyone up: a wrong or unknown address just fails.
import { useState } from "react";
import Turnstile, { TURNSTILE_SITE_KEY } from "@/components/Turnstile";
import { createClient } from "@/lib/supabase/client";

export function passwordErrorMessage(error: { code?: string; status?: number } | null): string {
  if (error?.code === "captcha_failed") return "The check didn't go through. Do the quick check again, then sign in.";
  if (error?.status === 429 || error?.code === "over_request_rate_limit") return "Too many tries. Wait a few minutes, then try again.";
  // Same message for an unknown email and a wrong password (never says which).
  return "That email and password didn't work. Most people sign in with an emailed code instead.";
}

export default function PasswordSignIn({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [state, setState] = useState<"idle" | "signing" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "signing") return;
    if (TURNSTILE_SITE_KEY && !captcha) {
      setError("The check has to pass first.");
      setState("error");
      return;
    }
    setState("signing");
    const { error: authError } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
      ...(captcha ? { options: { captchaToken: captcha } } : {}),
    });
    // A token is single-use whatever happened.
    setCaptcha(null);
    setCaptchaReset((n) => n + 1);
    if (authError) {
      setError(passwordErrorMessage(authError));
      setState("error");
      return;
    }
    // Full load, as after a code sign-in: nothing in memory from before survives.
    window.location.assign("/today");
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-3" aria-label="Sign in with a password">
      <label htmlFor="pw-email" className="sr-only">
        Email
      </label>
      <input
        id="pw-email"
        type="email"
        required
        autoComplete="username"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-accent"
      />
      <label htmlFor="pw-password" className="sr-only">
        Password
      </label>
      <input
        id="pw-password"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-accent"
      />
      {TURNSTILE_SITE_KEY && <Turnstile onToken={setCaptcha} resetKey={captchaReset} />}
      <button type="submit" disabled={state === "signing"} className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-white disabled:opacity-60">
        {state === "signing" ? "Signing in…" : "Sign in"}
      </button>
      {state === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="button" onClick={onBack} className="min-h-11 w-full text-sm font-semibold text-accent">
        Email me a code instead
      </button>
    </form>
  );
}
