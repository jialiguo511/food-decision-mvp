import AppShell from "@/components/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function GroceriesPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="Groceries" subtitle="Your shopping list will appear here.">
      <EmptyState title="No grocery list yet" action={{ href: "/today", label: "Find something to make" }}>
        A single shopping list from your planned recipes will live here. It isn&apos;t built yet.
      </EmptyState>
    </AppShell>
  );
}
