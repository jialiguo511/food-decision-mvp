"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Visible labels are the new Home / Plan / Groceries / Me information
// architecture (see CLAUDE.md → "The top-level information architecture").
// Route names (/today, /profile) are kept internally to avoid churn while
// the UX is still stabilizing — do not infer product meaning from them.
const TABS = [
  { href: "/today", label: "Home", icon: "🍽️" },
  { href: "/plan", label: "Plan", icon: "🗓️" },
  { href: "/groceries", label: "Groceries", icon: "🧺" },
  { href: "/profile", label: "Me", icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
