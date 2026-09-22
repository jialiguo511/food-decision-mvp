import AppShell from "@/components/AppShell";
import ComingNext from "@/components/ComingNext";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function GroceriesPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="Groceries" subtitle="Your shopping list will appear here.">
      <ComingNext label="Not available yet">
        One consolidated list from your planned and saved recipes — already
        have, need to buy, and optional additions.
      </ComingNext>
    </AppShell>
  );
}
