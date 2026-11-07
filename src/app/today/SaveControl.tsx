"use client";

import { useRef, useState } from "react";
import { saveFromSession, unsaveFromSession } from "../saved/actions";
import { friendlyActionError } from "./results/errorCopy";

/** Bookmark + label. Controlled: the parent owns `saved`, this owns only the
 *  in-flight guard and error line. Tapping toggles immediately (optimistic) and
 *  rolls back with a message if the save fails. No modal, no reason. */
export function SaveButton({
  sessionId,
  index,
  saved,
  onChange,
}: {
  sessionId: string;
  index: number;
  saved: boolean;
  onChange: (saved: boolean) => void;
}) {
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Development only: the server's exact diagnosis (step, code, likely cause).
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    const next = !saved;
    setError(null);
    setDiagnostic(null);
    onChange(next);
    try {
      const result = await (next ? saveFromSession(sessionId, index) : unsaveFromSession(sessionId, index));
      if (!result.ok) {
        onChange(!next);
        setError(friendlyActionError(result.error, "Couldn't save that. Please try again."));
        if (result.diagnostic) setDiagnostic(result.diagnostic);
      }
    } catch (failure) {
      onChange(!next);
      setError("Couldn't save that. Please try again.");
      // The action itself threw (network, server error): say so in development.
      if (process.env.NODE_ENV !== "production") setDiagnostic(`server action threw: ${failure instanceof Error ? failure.message : String(failure)}`);
    } finally {
      busy.current = false;
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={saved ? "Remove from Saved" : "Save for later"}
        className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3.5 text-xs font-semibold ${
          saved ? "bg-accent-soft text-accent" : "border border-line bg-card text-muted"
        }`}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M6 3h12v18l-6-4-6 4z" />
        </svg>
        <span aria-live="polite">{saved ? "Saved" : "Save"}</span>
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
      {diagnostic && (
        <span role="note" className="mt-1 max-w-xs break-words font-mono text-[10px] leading-snug text-muted">
          dev: {diagnostic}
        </span>
      )}
    </span>
  );
}

/** The save control for a recipe card. */
export function RecipeSaveControl({
  sessionId,
  index,
  initialSaved,
}: {
  sessionId: string;
  index: number;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  return <SaveButton sessionId={sessionId} index={index} saved={saved} onChange={setSaved} />;
}
