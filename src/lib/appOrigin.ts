// The bundled iOS app (Capacitor, UI shipped inside the app) runs at its own origin — not ours — and
// holds its Supabase session in the app, not in a cookie. Requests from it carry
// `Authorization: Bearer <access token>` instead. Proof of concept only (docs/IOS_RELEASE.md →
// "Bundled-UI proof of concept"); nothing here is used by the web app.
//
// Why a bearer request needs no CSRF guard: a browser never attaches it on its own (unlike a cookie),
// so another site can't make a signed-in request on the person's behalf. CORS is still limited to
// the app's origin so other sites can't READ responses either.

export const APP_ORIGINS = ["capacitor://localhost"] as const;

export function isAppOrigin(origin: string | null): boolean {
  return !!origin && (APP_ORIGINS as readonly string[]).includes(origin);
}

/** CORS headers for the app's origin; none for anyone else. */
export function appCorsHeaders(origin: string | null): Record<string, string> {
  if (!isAppOrigin(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** The bearer token, if the header is a well-formed one. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer ([A-Za-z0-9._-]{20,4096})$/);
  return match ? match[1] : null;
}
