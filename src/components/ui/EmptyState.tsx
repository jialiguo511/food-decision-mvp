import Link from "next/link";
import { buttonClass } from "./Button";

/** An empty area that says what to do next — never just "No data". The
 *  action is optional; most empty states point back to Home, where the one
 *  thing this product does happens. */
export default function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <section className="rounded-3xl border border-dashed border-line bg-card/60 px-6 py-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">{children}</p>
      {action && (
        <Link href={action.href} className={buttonClass("secondary", "mt-5 text-accent")}>
          {action.label}
        </Link>
      )}
    </section>
  );
}
