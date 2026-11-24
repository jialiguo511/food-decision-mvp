"use client";

// "Sign in with Apple" on the sign-in page — inside the iOS app only (lib/appleSignIn.ts). On the
// web the page stays email-only.
//
// Duplicate accounts. Apple's verified email that matches an existing account is linked to it by
// Supabase, so a returning email user lands in their own account. A "Hide My Email" relay address
// matches nothing and would create a second, empty account. So when Apple sign-in has just CREATED
// an account, the page stops and asks once: keep this new account, or "I already have one" — which
// deletes the just-made empty account (and revokes Apple's authorization for it) and returns to the
// email form, from where Apple can be linked in Me. Nothing is merged on a guess.

import { useEffect, useState } from "react";
import { APPLE_SIGNIN_ENABLED, signInWithApple } from "@/lib/appleSignIn";
import { isNativeApp, tapFeedback } from "@/lib/native";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "../profile/account.actions";

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "new"; code: string | null; relay: boolean }
  | { kind: "undoing" }
  | { kind: "error"; message: string };

export default function AppleSignInButton({
  onUseEmail,
  needsCaptcha = false,
  captchaToken = null,
  onCaptchaUsed,
}: {
  onUseEmail: (notice: string) => void;
  /** The sign-in check (Turnstile) is on: Apple sign-in needs its token too. */
  needsCaptcha?: boolean;
  captchaToken?: string | null;
  /** A token is single-use: the page resets the check after a try. */
  onCaptchaUsed?: () => void;
}) {
  const [native, setNative] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  // Decided after mount: the server render never knows it's inside the app.
  useEffect(() => setNative(isNativeApp()), []);
  if (!native || !APPLE_SIGNIN_ENABLED) return null;

  async function start() {
    if (state.kind === "working") return;
    if (needsCaptcha && !captchaToken) return setState({ kind: "error", message: "One moment — the check below has to finish first. Then tap again." });
    void tapFeedback();
    setState({ kind: "working" });
    const result = await signInWithApple(createClient(), { captchaToken });
    if (needsCaptcha) onCaptchaUsed?.();
    if (!result.ok) return setState(result.canceled ? { kind: "idle" } : { kind: "error", message: result.message });
    if (!result.firstSignIn) return window.location.assign("/today");
    setState({ kind: "new", code: result.authorizationCode, relay: /@privaterelay\.appleid\.com$/i.test(result.user.email ?? "") });
  }

  async function switchToEmail(code: string | null) {
    setState({ kind: "undoing" });
    const removed = await deleteAccount({ appleAuthorizationCode: code ?? undefined }).catch(() => ({ ok: false as const, error: "" }));
    await createClient().auth.signOut().catch(() => undefined);
    onUseEmail(
      removed.ok
        ? "Sign in with your email below. Once you're in, you can add Apple under Me → Sign-in methods, so both open the same account."
        : "Sign in with your email below. (We couldn't remove the empty Apple account just now — you can delete it any time from Me after signing in with Apple.)",
    );
    setState({ kind: "idle" });
  }

  if (state.kind === "new" || state.kind === "undoing") {
    const code = state.kind === "new" ? state.code : null;
    return (
      <div className="rounded-2xl border border-line bg-card p-5" role="status">
        <p className="font-semibold">You&apos;re in with a new account.</p>
        <p className="mt-1 text-sm text-muted">
          {state.kind === "new" && state.relay
            ? "Apple is hiding your email, so we couldn't match an earlier account. "
            : "We didn't find an earlier account for this Apple ID. "}
          Used this app with your email before? Use that instead, so your preferences and saved meals stay together.
        </p>
        <div className="mt-4 space-y-2">
          <button type="button" onClick={() => window.location.assign("/today")} disabled={state.kind === "undoing"} className="min-h-12 w-full rounded-2xl bg-accent font-semibold text-white disabled:opacity-60">
            Continue with this new account
          </button>
          <button type="button" onClick={() => void switchToEmail(code)} disabled={state.kind === "undoing"} className="min-h-12 w-full rounded-2xl border border-line bg-card text-sm font-semibold disabled:opacity-60">
            {state.kind === "undoing" ? "Switching to email…" : "I already have an account — use my email"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={state.kind === "working"}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black font-semibold text-white disabled:opacity-60"
      >
        <svg aria-hidden width="17" height="20" viewBox="0 0 17 20" fill="currentColor">
          <path d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.6 4.8 2 5.8 1.1 7.4c-1.9 3.2-.5 8 1.3 10.6.9 1.3 1.9 2.7 3.3 2.6 1.3-.1 1.8-.9 3.4-.9 1.6 0 2 .9 3.4.8 1.4 0 2.3-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.8-1.1-3-4.3zM11.5 2.9c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.1 1.2.1 2.3-.6 3-1.5z" />
        </svg>
        {state.kind === "working" ? "Signing in…" : "Sign in with Apple"}
      </button>
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3 pt-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" />
        or use your email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
