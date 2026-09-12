import AppShell from "@/components/AppShell";
import ComingNext from "@/components/ComingNext";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function MyFoodPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="My Food" subtitle="Pantry, favorites and what you've eaten.">
      <ComingNext label="Not available yet">
        Your pantry list, saved favorites, and the meals you actually ate.
      </ComingNext>
    </AppShell>
  );
}
