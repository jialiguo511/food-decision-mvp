import BottomNav from "./BottomNav";

/**
 * The frame every signed-in page sits in: a narrow mobile-first column,
 * a plain title header, and the bottom tab bar.
 */
export default function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="px-5 pt-8 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      </header>

      {/* pb-24 keeps content clear of the fixed nav */}
      <main className="flex-1 px-5 pb-28">{children}</main>

      <BottomNav />
    </div>
  );
}
