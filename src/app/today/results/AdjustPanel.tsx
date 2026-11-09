"use client";

import Button from "@/components/ui/Button";
import { INTERPRET_MAX_CHARS } from "@/lib/interpret/schema";
import { QUICK_ADJUSTS, type QuickAdjust } from "../flow/adjust";
import type { AdjustingWay } from "@/lib/interpret/schema";

/** What the results screen needs to run "Adjust" — owned by Home so the text survives a failed
 *  request and a stale answer can never overwrite it. */
export type AdjustState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
  setValue: (text: string) => void;
  /** Send the typed change (the model reads it once — only after this is pressed). */
  submit: () => void;
  /** A one-tap change: no model, no text. */
  quick: (kind: QuickAdjust) => void;
  /** A change is being read or applied. */
  busy: boolean;
  error: string | null;
  /** Calm information (nothing to change); not an error. */
  notice: string | null;
  /** What the way-of-asking is now, so the one-tap change to the current way isn't offered. */
  way: AdjustingWay;
  /** "Edit my sentence" / "Edit answers step by step". */
  editLabel: string;
  onEdit: () => void;
};

/**
 * "Adjust": change what was asked, in words, without starting over — and across ways (a snack
 * request can become a proper meal you cook, a Cook request can become something to buy).
 * Not a chat: one box, a few one-tap changes, an Update button. Nothing is sent until Update.
 */
export default function AdjustPanel({ state }: { state: AdjustState }) {
  const { value, busy } = state;
  const empty = value.trim().length === 0;
  return (
    <section aria-label="Adjust the recommendation" className="rounded-2xl border border-line bg-card p-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!empty && !busy) state.submit();
        }}
      >
        <label htmlFor="adjust-text" className="text-sm font-semibold">
          What should change?
        </label>
        <textarea
          id="adjust-text"
          value={value}
          onChange={(event) => state.setValue(event.target.value)}
          rows={2}
          maxLength={INTERPRET_MAX_CHARS}
          disabled={busy}
          placeholder="e.g. I'll cook a proper meal · Same, but under $10"
          aria-invalid={state.error ? true : undefined}
          className="mt-2 block w-full resize-none rounded-2xl border border-line bg-cream p-3 text-base leading-relaxed outline-none focus:border-accent disabled:opacity-60"
        />
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="One-tap changes">
          {QUICK_ADJUSTS.filter((q) => q.way !== state.way).map((q) => (
            <button
              key={q.kind}
              type="button"
              disabled={busy}
              onClick={() => state.quick(q.kind)}
              className="min-h-11 rounded-full border border-line bg-card px-4 text-sm text-ink/80 transition-colors hover:border-accent/50 disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>
        {state.error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p role="status" className="mt-2 text-sm text-muted">
            {state.notice}
          </p>
        )}
        <Button type="submit" className="mt-3" disabled={empty || busy}>
          {busy ? "Updating…" : "Update recommendations"}
        </Button>
      </form>
      <div className="mt-1 flex items-center justify-between gap-2">
        <Button variant="quiet" onClick={state.onEdit} className="-ml-3">
          {state.editLabel}
        </Button>
        <Button variant="quiet" onClick={() => state.setOpen(false)} className="-mr-3 text-muted">
          Close
        </Button>
      </div>
    </section>
  );
}
