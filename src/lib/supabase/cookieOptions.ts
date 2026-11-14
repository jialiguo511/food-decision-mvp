// One place that finishes the attributes of the session cookies Supabase asks us to write.
//
// @supabase/ssr's defaults are SameSite=Lax, path "/", a long max-age and HttpOnly=false. HttpOnly
// stays false ON PURPOSE for now: the browser client reads and clears the session itself (sign-out,
// and the sign-in page's one-time-code entry), and a script cannot touch an HttpOnly cookie. Moving
// both to the server is the way to HttpOnly — see docs/RELEASE.md §6.7 "Known limits".
//
// What this adds: `Secure` whenever the request arrived over HTTPS (so the cookie is never sent over
// plain http), and SameSite=Lax if a caller left it out. It is applied wherever the session cookie
// is written (server client, middleware refresh) so a refresh cannot drop the attribute again.

export function isHttpsRequest(headers: Headers, url?: string): boolean {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  return url ? url.startsWith("https:") : false;
}

export function sessionCookieOptions<T extends object>(options: T | undefined, https: boolean): T & { sameSite?: unknown; secure?: boolean } {
  const given = (options ?? {}) as { sameSite?: unknown };
  return {
    ...(options ?? {}),
    sameSite: given.sameSite ?? "lax",
    ...(https ? { secure: true } : {}),
  } as T & { sameSite?: unknown; secure?: boolean };
}
