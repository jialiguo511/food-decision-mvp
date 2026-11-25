// GET /api/app/saved?tab=recipes|places — Saved for the iOS app (lib/app/saved.ts).
import { withUser } from "@/lib/app/route";
import { loadSaved, parseSavedTab } from "@/lib/app/saved";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const tab = parseSavedTab(new URL(request.url).searchParams.get("tab"));
  return withUser((supabase, user) => loadSaved(supabase, user, tab));
}
