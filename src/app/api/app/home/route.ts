// GET /api/app/home?start=cook|order|store_snack — Home's props for the iOS app (lib/app/home.ts).
import { loadHome } from "@/lib/app/home";
import { withUser } from "@/lib/app/route";
import { parseStartMode } from "@/app/today/flow/homeReducer";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const start = parseStartMode(new URL(request.url).searchParams.get("start"));
  return withUser((supabase, user) => loadHome(supabase, user, start));
}
