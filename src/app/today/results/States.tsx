"use client";

import { useState } from "react";
import Button, { buttonClass } from "@/components/ui/Button";
import type { RecommendUiError } from "@/lib/types";
import { brokenRules, errorCopy } from "./errorCopy";

/** While the recommender (or the location prompt) works: a calm list of what
 *  is being taken into account, then three slim placeholders for the three
 *  options. No fake recipe card, nothing wider than the column, no fake
 *  progress. `lines` come from the request itself (see loadingLines). */
export function LoadingState({
  phase,
  lines,
  startedAt,
}: {
  phase: "locating" | "nearby" | "generate";
  lines: string[];
  /** When the request began (ms epoch). A Home that remounts mid-request picks
   *  the entrance animation up where it would be, instead of replaying it as if
   *  the search had just started. */
  startedAt?: number;
}) {
  // Read once, at mount: how far into the request this view appears.
  const [elapsed] = useState(() => (startedAt === undefined ? 0 : Math.max(0, Date.now() - startedAt)));
  const resumed = elapsed > 500;
  if (phase === "locating") {
    return (
      <div role="status" aria-live="polite" className="animate-fade-in">
        <p className="text-lg font-semibold">Checking where you are…</p>
        <p className="mt-1 text-sm text-muted">Your browser may ask to share your location. It&apos;s used once and isn&apos;t saved.</p>
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className={resumed ? undefined : "animate-fade-in"}>
      <p className="text-lg font-semibold">{phase === "nearby" ? "Finding a few good places…" : "Finding a few good options…"}</p>
      <ul className="mt-4 space-y-2.5">
        {lines.map((line, i) => (
          <li key={line} className="animate-fade-in flex items-center gap-3 text-sm text-muted" style={{ animationDelay: `${i * 450 - elapsed}ms` }}>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-6 space-y-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-16 items-center gap-3 rounded-2xl border border-line bg-card px-4">
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-line/70" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-line/70" />
              <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-line/50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A failed request, in human words, with the next useful step. `compact`
 *  when the last good cards are still on screen underneath. */
export function ErrorState({
  error,
  reference,
  compact = false,
  onRetry,
  onIdeasByType,
  onChange,
}: {
  error: RecommendUiError;
  /** The request's id — the same one the server logs — so a failure can be looked up. */
  reference?: string;
  compact?: boolean;
  onRetry: () => void;
  onIdeasByType?: () => void;
  onChange: () => void;
}) {
  const copy = errorCopy(error.code);
  return (
    <section role="alert" className={`rounded-3xl border border-line bg-card ${compact ? "p-4" : "p-5"} animate-fade-in`}>
      <p className="text-base font-semibold">{copy.title}</p>
      <p className="mt-1 text-sm text-muted">{copy.body}</p>
      {error.code === "constraint_violation" && brokenRules(error.reasons) && (
        <p className="mt-1 text-sm text-ink/80" data-testid="broken-rules">
          {brokenRules(error.reasons)}
        </p>
      )}
      {reference && (
        <p className="mt-2 select-all text-[11px] text-muted/80" data-testid="error-reference">
          Reference {reference} · {error.code}
        </p>
      )}
      <div className="mt-4 space-y-2">
        {copy.retry && <Button onClick={onRetry}>Try again</Button>}
        {copy.byType && onIdeasByType && (
          <Button variant="secondary" onClick={onIdeasByType}>
            Get food ideas by type
          </Button>
        )}
        {error.code === "unauthenticated" && (
          // A new tab on purpose: this page keeps the answers; the sign-in cookie is shared, so Try again works afterwards.
          <a href="/login" target="_blank" rel="noopener" className={buttonClass("primary")}>
            Sign in (opens a new tab)
          </a>
        )}
        {copy.change && !compact && (
          <Button variant="quiet" className="w-full" onClick={onChange}>
            Change my answers
          </Button>
        )}
        {/* New tab: this page keeps the answers. */}
        <a href="/feedback?from=/today" target="_blank" rel="noopener" className="block py-1 text-center text-xs text-muted underline">
          Report a problem
        </a>
      </div>
    </section>
  );
}

/** A short, calm note above the cards (fewer than three, nothing nearby…). */
export function Notice({ title, body, children }: { title: string; body?: string; children?: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-accent/30 bg-accent-soft/50 p-4">
      <p className="text-sm font-semibold text-accent">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {children && <div className="mt-3 space-y-2">{children}</div>}
    </section>
  );
}
