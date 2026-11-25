// Supabase client for Server Components, Server Actions and Route Handlers.
//
// It reads the logged-in user's session out of the request cookies, so every
// query it makes runs *as that user* and Row Level Security applies.
//
// Never import this into a client component.

import { cookies, headers } from "next/headers";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { createClient as createTokenClient } from "@supabase/supabase-js";
import { bearerToken } from "@/lib/appOrigin";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { isHttpsRequest, sessionCookieOptions } from "./cookieOptions";

export async function createClient() {
  // In Next.js 15 cookies() is async.
  const cookieStore = await cookies();
  const headerList = await headers();
  const https = isHttpsRequest(headerList);

  // The bundled iOS app has no cookie on this domain; it sends its Supabase access token instead
  // (lib/appOrigin.ts). The token is VALIDATED with Supabase by every getUser() call below, and the
  // same token goes with every query, so Row Level Security applies exactly as for a cookie session.
  // A browser never adds this header by itself, and CORS lets only the app's origin send it.
  const token = bearerToken(headerList.get("authorization"));
  if (token) return asServerClient(tokenClient(token));

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
            cookieStore.set(name, value, sessionCookieOptions(options, https));
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

/** A client acting as the bearer token's user. `auth.getUser()` with no argument checks THIS token
 *  with Supabase (a plain supabase-js client has no stored session to check). */
function tokenClient(token: string) {
  const client = createTokenClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const getUser = client.auth.getUser.bind(client.auth);
  client.auth.getUser = (jwt?: string) => getUser(jwt ?? token);
  return client;
}

/** Same class either way; the cookie client's generic parameters are what every caller is typed against. */
function asServerClient(client: ReturnType<typeof tokenClient>) {
  return client as unknown as ReturnType<typeof createServerClient>;
}
