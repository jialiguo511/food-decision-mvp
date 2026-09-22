import AppShell from "@/components/AppShell";
import ComingNext from "@/components/ComingNext";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function PlanPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="Plan" subtitle="Plan a few meals ahead and shop once.">
      <ComingNext label="Not available yet">
        Browse suggested recipes, save the ones you want, and generate one
        grocery list from them.
      </ComingNext>
    </AppShell>
  );
}
