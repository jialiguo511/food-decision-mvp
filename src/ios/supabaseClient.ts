"use client";

// The bundled app's Supabase client — used in place of src/lib/supabase/client.ts (next.config.ts
// swaps the module for the iOS build). Same `createClient()` name, so sign-in, sign-out and account
// deletion code is unchanged. One instance; the session is kept in the Keychain and refreshed
// automatically; nothing is read from or written to the URL.
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { keychainStorage } from "@/ios/keychainStorage";

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (!client) {
    client = createSupabase(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storage: keychainStorage, storageKey: "wte-session", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "implicit" },
    });
  }
  return client;
}

/** The current access token (refreshed first if it has expired), or null when signed out. */
export async function accessToken(): Promise<string | null> {
  const { data } = await createClient().auth.getSession();
  return data.session?.access_token ?? null;
}
