import AppShell from "@/components/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function PlanPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="Plan" subtitle="Plan a few meals ahead and shop once.">
      <EmptyState title="Planning ahead isn't here yet" action={{ href: "/today", label: "Decide your next meal" }}>
        Soon you&apos;ll be able to line up a few meals and shop once. For now, Home picks what to eat next.
      </EmptyState>
    </AppShell>
  );
}
