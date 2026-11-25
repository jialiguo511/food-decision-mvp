// GET /api/app/profile — Me for the iOS app (lib/app/profile.ts).
import { loadProfile } from "@/lib/app/profile";
import { withUser } from "@/lib/app/route";

export const dynamic = "force-dynamic";

export function GET() {
  return withUser((supabase, user) => loadProfile(supabase, user));
}
