/** Honest placeholder for the areas we haven't built yet. It names what will
 *  be here so the navigation makes sense while the app is half-built.
 *  `label` is user-facing copy — never an internal roadmap reference. */
export default function ComingNext({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-card/60 p-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-accent">
        {label}
      </p>
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  );
}
