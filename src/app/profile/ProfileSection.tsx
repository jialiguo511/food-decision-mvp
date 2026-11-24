/** A titled group of Profile cards, with one line saying what the group is
 *  for — so it's clear which answers always shape suggestions and which only
 *  refine them. */
export default function ProfileSection({
  id,
  title,
  caption,
  children,
}: {
  /** Anchor for links from the "optional details" card. */
  id?: string;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <header className="px-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted">{caption}</p>
      </header>
      {children}
    </section>
  );
}
