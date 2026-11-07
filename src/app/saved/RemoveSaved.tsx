"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeSaved } from "./actions";

/** "Remove" on a Saved card — one tap, no confirmation (saving again is one
 *  tap too). Refreshes the server-rendered list when it's done. */
export default function RemoveSaved({ kind, id }: { kind: "recipe" | "place"; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeSaved(kind, id);
      if (result.ok) router.refresh();
      else setError(result.error);
    } catch {
      setError("Couldn't remove that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button type="button" onClick={remove} disabled={busy} className="-mr-2 inline-flex min-h-11 items-center px-2 text-xs font-semibold text-muted underline disabled:opacity-50">
        {busy ? "Removing…" : "Remove"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}
