// Supabase client with the SERVICE-ROLE key — it bypasses Row Level Security and
// can delete auth users. Server-only, and used for exactly one thing: deleting an
// account (src/app/profile/account.actions.ts), always for the user id of the
// *verified* session, never for an id the browser sent.
//
// The key has no NEXT_PUBLIC_ prefix, so Next.js never inlines it into browser
// code, and importing this from a client component throws. It is read when
// called, not at import, so a missing key degrades to "can't delete" instead of
// breaking every page that happens to load this file.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

/** The admin client, or null when SUPABASE_SERVICE_ROLE_KEY isn't configured. */
export function createAdminClient(): SupabaseClient | null {
  if (typeof window !== "undefined") throw new Error("The admin Supabase client must never run in the browser.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL.startsWith("http") || !key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
