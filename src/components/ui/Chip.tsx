"use client";

/** A single tappable pill. The whole product is built out of these. */
export default function Chip({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-3.5 py-2 text-left text-sm transition-colors ${
        selected
          ? "border-accent bg-accent-soft font-medium text-accent"
          : "border-line bg-card text-ink hover:border-muted"
      }`}
    >
      <span className="block leading-tight">{label}</span>
      {hint && (
        <span
          className={`block text-[11px] leading-tight ${
            selected ? "text-accent/70" : "text-muted"
          }`}
        >
          {hint}
        </span>
      )}
    </button>
  );
}
