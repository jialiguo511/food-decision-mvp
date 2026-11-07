/** One question on its own screen: Back, a thin progress line (no "Step 3 of
 *  9"), the question, its answers, then its actions — all in normal document
 *  flow, so nothing floats over the answers or the bottom nav. `stepKey`
 *  remounts the body so each question slides in. */
export default function QuestionScreen({
  stepKey,
  index,
  count,
  onBack,
  trailing,
  title,
  hint,
  children,
  footer,
}: {
  stepKey: string;
  index: number;
  count: number;
  /** Omitted on a first screen with nowhere to go back to. */
  onBack?: () => void;
  /** Right end of the header row, e.g. "Skip setup". */
  trailing?: React.ReactNode;
  title: string;
  hint?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        {onBack ? <BackButton onClick={onBack} /> : <span className="-ml-2 size-11 shrink-0" aria-hidden />}
        {/* A single screen has no progress to show. */}
        {count <= 1 ? <span className="flex-1" aria-hidden /> : <div
          className="flex flex-1 gap-1.5"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={count}
          aria-valuenow={index + 1}
        >
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= index ? "bg-accent" : "bg-line"}`}
            />
          ))}
        </div>}
        {trailing}
      </div>

      <div key={stepKey} className="animate-step-in pt-6">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
        <div className="mt-5">{children}</div>
        <div className="mt-6 space-y-2">{footer}</div>
      </div>
    </div>
  );
}

export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-line/50"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
