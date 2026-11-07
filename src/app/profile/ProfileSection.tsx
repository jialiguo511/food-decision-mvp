/** A titled group of Profile cards, with one line saying what the group is
 *  for — so it's clear which answers always shape suggestions and which only
 *  refine them. */
export default function ProfileSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <header className="px-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted">{caption}</p>
      </header>
      {children}
    </section>
  );
}
