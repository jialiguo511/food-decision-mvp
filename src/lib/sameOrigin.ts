// Defence in depth for the routes that spend money. The session cookie is SameSite=Lax, which
// already keeps other sites from sending it on a POST; this adds a check that doesn't depend on
// that: a browser always sends `Origin` on a cross-site POST, so a request whose Origin is some
// other host is refused before any work (or any metering) happens. A request with no Origin
// (curl, a server, a same-site navigation) is not a cross-site browser request and passes — it
// still needs a valid session and its own allowance.

export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // an Origin that isn't a URL ("null" from a sandboxed frame) is not ours
  }
}

/** A 403 for a cross-site request, or null to carry on. */
export function refuseCrossSite(request: Request): Response | null {
  return isCrossSite(request) ? Response.json({ error: "forbidden" }, { status: 403 }) : null;
}
