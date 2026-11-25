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
    "Access-Control-Allow-Headers": "authorization, content-type, x-app-version, x-request-id",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** The bearer token, if the header is a well-formed one. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer ([A-Za-z0-9._-]{20,4096})$/);
  return match ? match[1] : null;
}

/** The version header every bundled-app request carries. */
export const APP_VERSION_HEADER = "x-app-version";

/** Oldest app version this backend still serves (`MIN_IOS_APP_VERSION`, default 1.0.0). Raise it only
 *  when an API change can't be made compatible; older apps then show "Update required". */
export function minAppVersion(env: Record<string, string | undefined> = process.env): string {
  const v = env.MIN_IOS_APP_VERSION?.trim();
  return v && /^\d+\.\d+\.\d+$/.test(v) ? v : "1.0.0";
}

/** a < b for dotted versions ("1.2.0" < "1.10.0"). Malformed versions count as oldest. */
export function versionLessThan(a: string, b: string): boolean {
  const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : [0, 0, 0]);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}
