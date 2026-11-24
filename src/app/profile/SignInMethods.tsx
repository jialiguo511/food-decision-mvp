"use client";

// Me → Sign-in methods. Shows how this account can be opened and, inside the iOS app, lets an
// email account add Sign in with Apple — Supabase's manual identity linking, done only by the
// signed-in person, never inferred. Needs "Manual linking" enabled in Supabase Auth.

import { useEffect, useState } from "react";
import { signInWithApple } from "@/lib/appleSignIn";
import { isNativeApp } from "@/lib/native";
import { createClient } from "@/lib/supabase/client";

export default function SignInMethods({ email, providers }: { email: string | null; providers: string[] }) {
  const [native, setNative] = useState(false);
  const [apple, setApple] = useState(providers.includes("apple"));
  const [state, setState] = useState<"idle" | "linking" | "linked" | "error">("idle");
  const [message, setMessage] = useState("");
  useEffect(() => setNative(isNativeApp()), []);

  async function link() {
    setState("linking");
    const result = await signInWithApple(createClient(), { link: true });
    if (result.ok) {
      setApple(true);
      setState("linked");
    } else if (result.canceled) {
      setState("idle");
    } else {
      setMessage(result.message);
      setState("error");
    }
  }

  // On the web an Apple-less account has nothing to show or do here.
  if (!native && !apple) return null;
  const relay = !!email && /@privaterelay\.appleid\.com$/i.test(email);

  return (
    <section className="mb-6 rounded-3xl border border-line bg-card p-4" aria-labelledby="sign-in-methods">
      <h2 id="sign-in-methods" className="text-base font-semibold">
        Sign-in methods
      </h2>
      <ul className="mt-2 space-y-2 text-sm">
        {providers.includes("email") && (
          <li className="flex min-h-11 items-center justify-between gap-3">
            <span>
              Email code{email && !relay ? <span className="text-muted"> · {email}</span> : null}
            </span>
            <span className="text-sage">On</span>
          </li>
        )}
        <li className="flex min-h-11 items-center justify-between gap-3">
          <span>
            Sign in with Apple{relay ? <span className="text-muted"> · email hidden by Apple</span> : null}
          </span>
          {apple ? (
            <span className="text-sage">{state === "linked" ? "Added" : "On"}</span>
          ) : (
            <button type="button" onClick={() => void link()} disabled={state === "linking"} className="min-h-11 rounded-xl px-3 font-semibold text-accent disabled:opacity-60">
              {state === "linking" ? "Adding…" : "Add"}
            </button>
          )}
        </li>
      </ul>
      {state === "error" && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {message}
        </p>
      )}
    </section>
  );
}
