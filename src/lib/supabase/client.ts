// Supabase client for client components (sign-in / sign-out only).
//
// This uses the anon key, which is meant to be public. What protects your data
// is Row Level Security in Postgres, not the secrecy of this key.

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
