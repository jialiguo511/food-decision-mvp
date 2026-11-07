import BottomNav from "./BottomNav";

/**
 * The frame every signed-in page sits in: a narrow mobile-first column, an
 * optional title header, and the bottom tab bar. Home passes no title — each
 * of its screens has its own heading.
 */
export default function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      {title ? (
        <header className="px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
            {action}
          </div>
        </header>
      ) : (
        <div className="pt-[max(1.5rem,env(safe-area-inset-top))]" />
      )}

      {/* Bottom padding = nav height + safe area, so the last card and its
          buttons always scroll fully clear of the fixed nav. */}
      <main className="flex-1 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">{children}</main>

      <BottomNav />
    </div>
  );
}
