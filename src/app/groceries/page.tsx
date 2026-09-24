import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import GroceryHelperCard from "./GroceryHelperCard";

export default async function GroceriesPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  await requireUser();

  return (
    <AppShell title="Groceries" subtitle="Figure out what to buy next.">
      <GroceryHelperCard />
    </AppShell>
  );
}
