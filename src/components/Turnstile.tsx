"use client";

// Cloudflare Turnstile — a free, mostly invisible check that a person (not a script) is asking
// for a sign-in link. OFF unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so local work and a
// deployment that hasn't enabled it are unaffected. The token is verified by SUPABASE, not by
// this app: enable "CAPTCHA protection" in the Supabase dashboard (Authentication → Attack
// Protection) with the Turnstile SECRET key; the secret never comes near this code.
//
// The script comes from challenges.cloudflare.com (an exact, documented URL). A token is
// single-use, so the widget is reset after each sign-in attempt.
//
// When the check cannot run, the reason is shown with its real code (Cloudflare's
// error-callback code, or "script" when the script itself never loaded) and a retry — it
// is never left looking like "not finished yet". The token is never logged or displayed.

import { useCallback, useEffect, useRef, useState } from "react";
import { turnstileProblemMessage, type TurnstileProblem } from "@/lib/loginErrors";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_TIMEOUT_MS = 20_000;

/** Resolves when window.turnstile exists; rejects if the script is blocked, fails, or hangs. */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    const el = script;
    const timer = window.setTimeout(() => {
      el.remove(); // a retry must fetch it again, not wait on a stuck tag
      reject(new Error("timeout"));
    }, SCRIPT_TIMEOUT_MS);
    el.addEventListener("load", () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve();
      else reject(new Error("no-api"));
    });
    el.addEventListener("error", () => {
      window.clearTimeout(timer);
      el.remove();
      reject(new Error("error"));
    });
  });
}

function Widget({
  onToken,
  onProblem,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  onProblem: (problem: TurnstileProblem | null) => void;
  resetKey: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callbacks = useRef({ onToken, onProblem });
  useEffect(() => {
    callbacks.current = { onToken, onProblem };
  });

  useEffect(() => {
    if (!box.current) return;
    let cancelled = false;
    const fail = (problem: TurnstileProblem) => {
      if (cancelled) return;
      // Code and host only — never the token.
      console.warn("[turnstile]", problem.stage, problem.code ?? "-", window.location.hostname);
      callbacks.current.onToken(null);
      callbacks.current.onProblem(problem);
    };
    loadScript().then(
      () => {
        if (cancelled || !box.current || !window.turnstile || widget.current) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token: string) => {
            callbacks.current.onProblem(null);
            callbacks.current.onToken(token);
          },
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": (code: unknown) => {
            fail({ stage: "widget", code: code == null ? null : String(code) });
            return true; // handled here; Cloudflare need not also warn
          },
          "unsupported-callback": () => fail({ stage: "widget", code: "unsupported" }),
        });
      },
      () => fail({ stage: "script", code: null }),
    );
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  // A new attempt needs a new token.
  useEffect(() => {
    if (resetKey > 0 && widget.current && window.turnstile) {
      callbacks.current.onToken(null);
      window.turnstile.reset(widget.current);
    }
  }, [resetKey]);

  return <div ref={box} data-testid="turnstile" className="min-h-[65px]" />;
}

/**
 * The check plus its own failure state: if it cannot run, says why and offers a retry
 * (which mounts a fresh widget and, if the script never loaded, fetches it again).
 */
export default function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const [problem, setProblem] = useState<TurnstileProblem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setProblem(null);
    onToken(null);
    setAttempt((n) => n + 1);
  }, [onToken]);

  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div>
      <Widget key={attempt} onToken={onToken} onProblem={setProblem} resetKey={resetKey} />
      {problem && (
        <div role="alert" data-testid="turnstile-problem" className="mt-2 rounded-2xl border border-line bg-card p-3 text-sm">
          <p>{turnstileProblemMessage(problem, typeof window === "undefined" ? "" : window.location.hostname)}</p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 font-semibold text-accent">
            Try the check again
          </button>
        </div>
      )}
    </div>
  );
}
