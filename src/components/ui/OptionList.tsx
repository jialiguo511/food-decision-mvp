"use client";

type Option = { value: string; label: string; hint?: string };

/** One question's answers as full-width rows — the shape a one-question
 *  screen wants (bigger targets, room for a hint) where a busy form used
 *  wrapped chips. Tapping the already-selected row counts as a pick too, so a
 *  remembered answer can be accepted with one tap. */
export default function OptionList({
  options,
  value,
  onPick,
  label,
}: {
  options: Option[];
  value: string;
  onPick: (value: string) => void;
  /** Accessible name for the group (the question). */
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-2.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onPick(option.value)}
            className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99] ${
              selected ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-muted"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className={`block text-base leading-snug ${selected ? "font-semibold text-accent" : "font-medium"}`}>
                {option.label}
              </span>
              {option.hint && (
                <span className={`mt-0.5 block text-xs ${selected ? "text-accent/80" : "text-muted"}`}>{option.hint}</span>
              )}
            </span>
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                selected ? "border-accent bg-accent text-white" : "border-line"
              }`}
            >
              {selected && (
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
