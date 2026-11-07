"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Visible labels are the Home / Plan / Groceries / Saved / Me information
// architecture (see CLAUDE.md → "The top-level information architecture").
// Route names (/today, /profile) are kept internally to avoid churn while
// the UX is still stabilizing — do not infer product meaning from them.
const TABS = [
  { href: "/today", label: "Home", icon: "M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1z" },
  { href: "/plan", label: "Plan", icon: "M5 6h14v13H5zM5 10h14M9 4v4M15 4v4" },
  { href: "/groceries", label: "Groceries", icon: "M4 6h2l2 10h9l2-7H7M10 20h.01M17 20h.01" },
  { href: "/saved", label: "Saved", icon: "M7 4h10v16l-5-3.5L7 20z" },
  { href: "/profile", label: "Me", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0" },
];

/** Five tabs fit a 320px phone at ~64px each; every tab is a 56px-tall
 *  target. Fixed to the bottom — AppShell's <main> reserves its height plus
 *  the safe area, so it never covers content. */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur" aria-label="Main">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill={active ? "currentColor" : "none"}
                fillOpacity={active ? 0.15 : undefined}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={tab.icon} />
              </svg>
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
