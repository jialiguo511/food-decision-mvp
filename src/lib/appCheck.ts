// The sign-in check bridge for the bundled iOS app (docs/IOS_RELEASE.md → "Sign-in check bridge").
//
// Cloudflare only issues a real Turnstile token to an allowed web hostname, and a bundled screen
// runs at capacitor://localhost. So the app opens /app/check on our real domain in Apple's
// authentication sheet (ASWebAuthenticationSession); Turnstile runs there and the page returns the
// one-time token to the app through `whattoeat-auth://check#state=…&token=…`. The app then requests
// and verifies the email code itself, so the SESSION never leaves Supabase → app: no access or
// refresh token is ever in a URL, a log, or this server.
//
// What travels in the callback URL is only the Turnstile token: single-use, valid ~5 minutes, and
// worthless without the email it is used with. `state` is a random value the app made for this
// one sheet; a callback whose state doesn't match is dropped (no injected or replayed callbacks).

export const APP_CALLBACK_SCHEME = "whattoeat-auth";

/** The app's `state`: 32 random bytes, base64url (43 chars). Anything else is refused. */
export function isValidState(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** A Turnstile token is opaque; bound its shape so nothing else can ride in the callback. */
export function isPlausibleCheckToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{20,2048}$/.test(value);
}

/** The callback the hosted page navigates to. Fragment, not query: never sent to any server. */
export function callbackUrl(state: string, token: string): string {
  return `${APP_CALLBACK_SCHEME}://check#${new URLSearchParams({ state, token }).toString()}`;
}

/** The app's side: accept a callback only for the state it is waiting for. */
export function readCallback(url: string, expectedState: string): { ok: true; token: string } | { ok: false; reason: "scheme" | "state" | "token" } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "scheme" };
  }
  if (parsed.protocol !== `${APP_CALLBACK_SCHEME}:`) return { ok: false, reason: "scheme" };
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  if (!isValidState(expectedState) || params.get("state") !== expectedState) return { ok: false, reason: "state" };
  const token = params.get("token");
  return isPlausibleCheckToken(token) ? { ok: true, token } : { ok: false, reason: "token" };
}
