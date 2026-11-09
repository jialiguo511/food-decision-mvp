// Where to send someone after the sign-in link works. The `next` parameter comes from
// the URL, so it is untrusted: appended to the origin as-is, "@evil.example" would turn
// `https://app.example` + `@evil.example` into a link to evil.example, and "//evil.example"
// or "/\evil.example" are read by browsers as other hosts. Only a plain path on THIS
// site is accepted; anything else falls back to Home.

export const DEFAULT_NEXT = "/today";

/** A same-site path ("/saved", "/profile?x=1"), or the default. */
export function safeNextPath(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 200) return DEFAULT_NEXT;
  // Must be a path from the root; "//host" and "/\host" are protocol-relative to a browser.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_NEXT;
  // No control characters, backslashes or whitespace tricks anywhere.
  if (/[\u0000-\u001f\u007f\\\s]/.test(raw)) return DEFAULT_NEXT;
  // Parse against a fixed fake origin: whatever it resolves to must still be that origin.
  try {
    const base = "https://app.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return DEFAULT_NEXT;
    // The callback itself is never a destination (a loop), and neither is the sign-in page.
    if (url.pathname.startsWith("/auth/") || url.pathname === "/login") return DEFAULT_NEXT;
    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_NEXT;
  }
}
