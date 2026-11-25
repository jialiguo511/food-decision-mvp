// Server Component. Reads Me's data (lib/app/profile.ts, shared with the iOS app's
// /api/app/profile) and renders the same view the app does. No spinner, no fetch.

import SetupNotice from "@/components/SetupNotice";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/app/profile";
import ProfileView from "./ProfileView";

export default async function ProfilePage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  const user = await requireUser();
  const data = await loadProfile(await createClient(), user);
  return <ProfileView data={data} />;
}
