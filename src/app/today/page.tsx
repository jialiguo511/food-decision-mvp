// Server Component. Reads everything Home needs (lib/app/home.ts, shared with the iOS app's
// /api/app/home) so its questions arrive already answered — a returning user can go straight to the
// mode's one button.

import AppShell from "@/components/AppShell";
import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadHome } from "@/lib/app/home";
import HomeFlow from "./HomeFlow";
import { parseStartMode } from "./flow/homeReducer";

export default async function TodayPage({ searchParams }: { searchParams?: Promise<{ start?: string | string[] }> }) {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const user = await requireUser();
  const supabase = await createClient();
  // An explicit "start in this mode" link (Saved's empty states). When present, the last
  // session is not restored as the opening screen — see initialScreen.
  const startMode = parseStartMode((await searchParams)?.start);
  const props = await loadHome(supabase, user, startMode);

  return (
    <AppShell>
      <HomeFlow {...props} />
    </AppShell>
  );
}
