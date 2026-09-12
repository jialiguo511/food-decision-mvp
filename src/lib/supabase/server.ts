// Supabase client for Server Components, Server Actions and Route Handlers.
//
// It reads the logged-in user's session out of the request cookies, so every
// query it makes runs *as that user* and Row Level Security applies.
//
// Never import this into a client component.

import { cookies } from "next/headers";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

export async function createClient() {
  // In Next.js 15 cookies() is async.
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // The `cookies` option is a union of the old get/set/remove shape and
      // this one, so TypeScript cannot infer the parameter for us.
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead, so this is safe
          // to ignore.
        }
      },
    },
  });
}

/** The logged-in user, or null. */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
