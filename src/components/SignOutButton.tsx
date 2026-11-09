"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function signOut() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    // Even if the network call fails, the local session is removed (scope "local" is the default for
    // the browser client), so continuing is right.
    await createClient().auth.signOut().catch(() => undefined);
    // A FULL page load, not router.replace(): the recommendation store and the picture caches live in
    // this tab's memory, and only a real navigation drops them — so the next person to sign in on this
    // browser cannot be handed the last person's cards, answers or pictures.
    window.location.assign("/login");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs text-muted disabled:opacity-60"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
