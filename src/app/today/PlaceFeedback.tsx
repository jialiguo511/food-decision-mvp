"use client";

import { useRef, useState } from "react";
import { PLACE_FEEDBACK_REASONS } from "@/lib/options";
import type { PlaceFeedbackAction } from "@/lib/types";
import { clearPlaceFeedback, recordPlaceFeedback } from "./actions";
import { friendlyActionError } from "./results/errorCopy";

/** What this user has already said about a place, for a restored session. */
export type PlaceFeedbackState = { action: PlaceFeedbackAction };

/**
 * A quiet "Not for me" on a nearby place card: one tap opens five reasons, one
 * more saves it. Only ever runs from these taps — a card that is merely
 * skipped, or a "Show me 3 more", records nothing. What it saves is the
 * user's own preference for their own future results (and can be undone right
 * here); it is never presented as a fact about the place.
 */
export default function PlaceFeedback({
  placeId,
  initial,
  onExcluded,
  onUndone,
}: {
  placeId: string;
  initial: PlaceFeedbackState | null;
  /** Called after a hard exclusion is stored (the place also leaves Saved). */
  onExcluded?: () => void;
  /** Called after the feedback is undone. */
  onUndone?: () => void;
}) {
  const [removedFromSaved, setRemovedFromSaved] = useState(false);
  const [state, setState] = useState<PlaceFeedbackState | null>(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  async function run<T>(work: () => Promise<T>, done: (result: T) => void) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      done(await work());
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  function choose(reason: string) {
    void run(
      () => recordPlaceFeedback(placeId, reason),
      (result) => {
        if (result.ok) {
          setState({ action: result.action });
          setRemovedFromSaved(result.removedFromSaved);
          setOpen(false);
          if (result.action === "exclude") onExcluded?.();
        } else setError(friendlyActionError(result.error, "Couldn't save that. Please try again."));
      },
    );
  }

  function undo() {
    void run(
      () => clearPlaceFeedback(placeId),
      (result) => {
        if (result.ok) {
          setState(null);
          setRemovedFromSaved(false);
          onUndone?.();
        } else setError(friendlyActionError(result.error, "Couldn't save that. Please try again."));
      },
    );
  }

  if (state) {
    return (
      <p className="w-full text-xs text-muted">
        {state.action === "exclude" ? "Noted — we won't suggest this place again." : "Noted — we'll suggest this place less."}
        {removedFromSaved && " Removed from Saved."}{" "}
        <button type="button" onClick={undo} disabled={saving} className="-my-2 inline-block px-1 py-2.5 font-semibold text-accent underline disabled:opacity-50">
          Undo
        </button>
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </p>
    );
  }

  return (
    <div className={open || error ? "w-full" : ""}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center px-1 text-xs font-semibold text-muted underline">
          Not for me
        </button>
      ) : (
        <div>
          <p className="text-xs text-muted">Why not?</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {PLACE_FEEDBACK_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => choose(r.value)}
                disabled={saving}
                className="min-h-10 rounded-full border border-line bg-card px-3.5 text-xs disabled:opacity-50"
              >
                {r.label}
              </button>
            ))}
            <button type="button" onClick={() => setOpen(false)} className="min-h-10 px-2 text-xs text-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
