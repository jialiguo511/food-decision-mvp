"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import SetupNotice from "@/components/SetupNotice";

/**
 * Magic link sign-in. No passwords to store, reset, or leak — Supabase emails
 * a one-time link that lands on /auth/callback.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  if (!isSupabaseConfigured) return <SetupNotice />;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        What should I eat?
      </h1>
      <p className="mt-2 text-muted">
        Three options. Chosen for the night you&apos;re actually having.
      </p>

      {state === "sent" ? (
        <div className="mt-8 rounded-2xl border border-line bg-card p-5">
          <p className="text-sm">
            Check <span className="font-medium">{email}</span> for a sign-in link.
          </p>
        </div>
      ) : (
        <form onSubmit={send} className="mt-8 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-2xl border border-line bg-card px-4 py-3 outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="w-full rounded-2xl bg-accent py-3.5 font-semibold text-white disabled:opacity-60"
          >
            {state === "sending" ? "Sending…" : "Email me a sign-in link"}
          </button>
          {state === "error" && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
