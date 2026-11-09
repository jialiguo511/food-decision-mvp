"use client";

import Button from "@/components/ui/Button";
import { INTERPRET_MAX_CHARS } from "@/lib/interpret/schema";
import type { DecisionMode } from "@/lib/types";
import { BackButton } from "./QuestionScreen";

/** User-facing names for the three modes. The internal names (cook / order /
 *  store_snack) never reach the screen. */
export const MODE_LABELS: Record<DecisionMode, { title: string; hint: string }> = {
  cook: { title: "Make something", hint: "Use what I have or buy a few things" },
  order: { title: "Get food", hint: "Nearby, pickup, or delivery" },
  store_snack: { title: "Grab a snack", hint: "Something quick from a store" },
};

const MODES: DecisionMode[] = ["cook", "order", "store_snack"];

/** Starting points for the sentence box — tapping one fills the box so it can
 *  be edited; it never sends anything. In the UI's language, one per mode. */
export const SITUATION_EXAMPLES = [
  "Just trained, very hungry, 20 minutes, I have eggs and rice.",
  "Tired and don't want to cook. Something nearby, around $15.",
  "Want something sweet that I can grab right now.",
] as const;

/** The last-used mode's answers, as one line — a shortcut, never the headline. */
export type LastTime = { mode: DecisionMode; summary: string[] };

/** "What should I eat?" — the three kinds of help, equal and first. Memory
 *  appears only as a quiet "Last time" line underneath. */
export default function StartScreen({
  lastTime,
  onUseAgain,
  onPickMode,
  onBackToPicks,
  draft,
  onDraft,
  onDescribe,
  describing,
  describeError,
}: {
  lastTime: LastTime | null;
  onUseAgain: () => void;
  onPickMode: (mode: DecisionMode) => void;
  /** Present when there are recent picks to go back to. */
  onBackToPicks?: () => void;
  /** The sentence being written. Owned by Home so it survives a failed read
   *  and a trip into the step-by-step path. */
  draft: string;
  onDraft: (text: string) => void;
  onDescribe: () => void;
  describing: boolean;
  describeError: string | null;
}) {
  const empty = draft.trim().length === 0;
  return (
    <div className="animate-fade-in">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight">What should I eat?</h1>

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!empty && !describing) onDescribe();
        }}
      >
        <label htmlFor="situation" className="text-sm font-semibold">
          Tell me what&apos;s going on
        </label>
        <textarea
          id="situation"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !empty && !describing) {
              event.preventDefault();
              onDescribe();
            }
          }}
          rows={3}
          maxLength={INTERPRET_MAX_CHARS}
          disabled={describing}
          aria-describedby="situation-help"
          aria-invalid={describeError ? true : undefined}
          placeholder="How hungry, how much time, what you have, what you feel like…"
          className="mt-2 block w-full resize-none rounded-2xl border border-line bg-card p-4 text-base leading-relaxed outline-none focus:border-accent disabled:opacity-60"
        />
        <p id="situation-help" className="mt-1.5 px-1 text-xs text-muted">
          Tip: tap the microphone on your phone&apos;s keyboard to say it out loud. We read your sentence once and don&apos;t save it.
        </p>
        {describeError && (
          <p role="alert" className="mt-2 px-1 text-sm text-red-700">
            {describeError}{" "}
            {describeError.startsWith("You've been signed out") && (
              <a href="/login" target="_blank" rel="noopener" className="font-semibold underline">
                Sign in (new tab)
              </a>
            )}
          </p>
        )}
        <Button type="submit" className="mt-3" disabled={empty || describing}>
          {describing ? "Reading what you said…" : "Help me decide"}
        </Button>
        <p className="mt-2 px-1 text-xs text-muted">If you ask for places nearby, we use your location once for that search. It isn&apos;t saved.</p>
      </form>

      <div className="mt-4 flex flex-col gap-2" aria-label="Examples">
        {SITUATION_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={describing}
            onClick={() => onDraft(example)}
            className="min-h-11 rounded-2xl border border-line bg-card px-4 py-2 text-left text-sm text-ink/80 transition-colors hover:border-accent/50 disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-muted" role="separator">
        <span className="h-px flex-1 bg-line" />
        Or choose step by step
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="mt-4 space-y-3">
        {MODES.map((mode) => (
          <ModeRow key={mode} mode={mode} onClick={() => onPickMode(mode)} />
        ))}
      </div>

      {lastTime && (
        <div className="mt-5 flex items-center gap-3 px-1">
          <p className="min-w-0 flex-1 text-sm text-muted">
            <span className="font-medium text-ink">Last time</span> · {MODE_LABELS[lastTime.mode].title}
            <span className="block">{lastTime.summary.join(" · ")}</span>
          </p>
          <Button variant="quiet" onClick={onUseAgain} className="shrink-0 font-semibold">
            Use again
          </Button>
        </div>
      )}

      {onBackToPicks && (
        <Button variant="quiet" onClick={onBackToPicks} className="mt-3 w-full">
          Back to your picks
        </Button>
      )}
    </div>
  );
}

export function ModeRow({ mode, onClick }: { mode: DecisionMode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 w-full items-center gap-4 rounded-3xl border border-line bg-card p-4 text-left shadow-[0_1px_2px_rgba(42,37,32,0.04)] transition-transform active:scale-[0.99]"
    >
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {mode === "cook" ? <PanIcon /> : mode === "order" ? <BagIcon /> : <SnackIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{MODE_LABELS[mode].title}</span>
        <span className="mt-0.5 block text-sm text-muted">{MODE_LABELS[mode].hint}</span>
      </span>
      <Chevron />
    </button>
  );
}

/** A mode the user has used before: its last answers as one quiet line with a
 *  small Edit, and the one button that acts on them. This is the mode's own
 *  page — not a "same as usual?" question — and it is only here to show what
 *  will be assumed (a place search, "buy a few things") before it runs. */
export function ModeScreen({
  mode,
  summary,
  note,
  cta,
  onFind,
  onEdit,
  onBack,
}: {
  mode: DecisionMode;
  summary: string[];
  note?: string;
  cta: string;
  onFind: () => void;
  onEdit: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="animate-step-in pt-4">
        <h2 className="text-2xl font-semibold tracking-tight">{MODE_LABELS[mode].title}</h2>
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-line bg-card py-3 pl-4 pr-2">
          <p className="min-w-0 flex-1 py-1.5 text-base">{summary.join(" · ")}</p>
          <Button variant="quiet" onClick={onEdit} className="shrink-0 font-semibold">
            Edit
          </Button>
        </div>
        {note && <p className="mt-2 px-1 text-xs text-muted">{note}</p>}
        <div className="mt-6">
          <Button onClick={onFind}>
            {cta}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PanIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="13" r="6" />
      <path d="M16 13h6M8 5c0-1 1-1 1-2M12 5c0-1 1-1 1-2" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 8V6a3 3 0 016 0v2" />
    </svg>
  );
}

function SnackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.01M14 9h.01M15 14h.01M10 15h.01" strokeWidth="2.4" />
    </svg>
  );
}
