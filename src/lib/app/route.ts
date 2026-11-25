// Shared plumbing for the iOS app's JSON endpoints (/api/app/*): one signed-in user from the
// verified session (app bearer token or, on the web, the cookie), no caching, codes not text in logs.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const NO_STORE = { "Cache-Control": "no-store, max-age=0", Vary: "Authorization, Cookie" };

export async function withUser(handler: (supabase: SupabaseClient, user: User) => Promise<unknown>): Promise<Response> {
  if (!isSupabaseConfigured) return Response.json({ error: { code: "not_configured" } }, { status: 503, headers: NO_STORE });
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: { code: "unauthenticated" } }, { status: 401, headers: NO_STORE });
  try {
    return Response.json(await handler(supabase, user), { headers: NO_STORE });
  } catch (error) {
    console.error("[app-api] read failed", { name: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: { code: "server_error" } }, { status: 500, headers: NO_STORE });
  }
}
