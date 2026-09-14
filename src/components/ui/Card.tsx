export default function Card({
  title,
  hint,
  highlighted = false,
  children,
}: {
  title?: string;
  hint?: string;
  /** Accent border + tint, e.g. for a chosen recommendation card. */
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 shadow-[0_1px_2px_rgba(42,37,32,0.04)] ${
        highlighted ? "border-accent bg-accent-soft/40" : "border-line bg-card"
      }`}
    >
      {title && (
        <header className="mb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
