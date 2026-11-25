// Saved: recipes and places the user wants to come back to. A plain read (lib/app/saved.ts, shared
// with the iOS app's /api/app/saved); nothing here calls the model or the places provider, and it
// changes no recommendation ranking.

import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { loadSaved, parseSavedTab } from "@/lib/app/saved";
import { createClient } from "@/lib/supabase/server";
import SavedView from "./SavedView";

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const user = await requireUser();
  const tab = parseSavedTab((await searchParams).tab);
  const data = await loadSaved(await createClient(), user, tab);
  return (
    <AppShell title="Saved" subtitle="Things you want to come back to.">
      <SavedView data={data} />
    </AppShell>
  );
}
