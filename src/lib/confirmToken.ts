// The emailed sign-in link carries a one-time token HASH in the URL *fragment*
// (`/auth/confirm#token_hash=…&type=email`). A fragment is never sent to a server, never
// appears in access logs, and is not sent as a Referer — so the token reaches only the page's
// own script. It is turned into a sign-in only by a deliberate POST (/auth/confirm/verify).
//
// Everything here is untrusted input: it comes from a URL anyone can craft.

/** `email` = Magic Link template (returning user); `signup` = Confirm-signup template (new user). */
export const CONFIRM_TYPES = ["email", "signup", "magiclink"] as const;
export type ConfirmType = (typeof CONFIRM_TYPES)[number];

// Supabase's hashed token is a hex digest, optionally prefixed ("pkce_…"). Anything else is refused
// before a request is made, so junk never costs a call to the auth service.
const TOKEN_HASH = /^[A-Za-z0-9_-]{20,128}$/;

export function isConfirmType(value: unknown): value is ConfirmType {
  return typeof value === "string" && (CONFIRM_TYPES as readonly string[]).includes(value);
}

export function isPlausibleTokenHash(value: unknown): value is string {
  return typeof value === "string" && TOKEN_HASH.test(value);
}

export type ConfirmRequest = { tokenHash: string; type: ConfirmType; next: string | null };

/** Reads `#token_hash=…&type=…[&next=…]`; null when it is missing or malformed. */
export function parseConfirmFragment(hash: string): ConfirmRequest | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (!isPlausibleTokenHash(tokenHash) || !isConfirmType(type)) return null;
  return { tokenHash, type, next: params.get("next") };
}

export type ConfirmFailure = "invalid" | "rate" | "network" | "refused";

/** One plain sentence per cause, always ending in the way forward (the code works in any case). */
export function confirmFailureMessage(reason: ConfirmFailure): string {
  switch (reason) {
    case "rate":
      return "Too many attempts just now. Wait a minute and tap the button again — or go back to sign-in and type the code from the email.";
    case "network":
      return "Couldn't reach the server. Check your connection and tap the button again.";
    case "refused":
      return "This request was refused. Open the link from the email again, or go back to sign-in and type the code from the email.";
    default:
      return "That link has already been used or has expired. Go back to sign-in and request a new email — the code in it works in any browser.";
  }
}
