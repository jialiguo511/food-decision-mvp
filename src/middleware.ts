// Refreshes the Supabase auth session on every request.
//
// Why this exists: Server Components can read cookies but cannot write them.
// Auth tokens expire. Middleware runs before the page and *can* write cookies,
// so it is the one place that can hand the user a fresh token. Without this,
// people get silently logged out after an hour.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";
import { isHttpsRequest, sessionCookieOptions } from "@/lib/supabase/cookieOptions";
import { APP_VERSION_HEADER, appCorsHeaders, isAppOrigin, minAppVersion, versionLessThan } from "@/lib/appOrigin";

export async function middleware(request: NextRequest) {
  // The bundled iOS app calls /api/* cross-origin with a bearer token: CORS for its origin only, and
  // an "update required" answer for app versions older than the backend still serves.
  const origin = request.headers.get("origin");
  if (request.nextUrl.pathname.startsWith("/api/") && isAppOrigin(origin)) {
    const cors = appCorsHeaders(origin);
    if (request.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });
    const version = request.headers.get(APP_VERSION_HEADER) ?? "";
    if (request.nextUrl.pathname !== "/api/app/config" && versionLessThan(version, minAppVersion())) {
      return NextResponse.json({ error: { code: "update_required", message: "Please update the app." } }, { status: 426, headers: cors });
    }
    // No cookie session to refresh for the app; RLS and getUser() use its token.
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
    return response;
  }
  if (!isSupabaseConfigured) return NextResponse.next();
  const https = isHttpsRequest(request.headers, request.url);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, sessionCookieOptions(options, https));
        }
      },
    },
  });

  // Touching getUser() is what triggers the refresh. Do not remove.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
