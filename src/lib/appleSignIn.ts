// Sign in with Apple, inside the iOS app (docs/IOS_RELEASE.md → "Sign in with Apple").
//
// Flow: the page makes a random nonce, gives Apple only its SHA-256 hash (through the native
// AppleSignIn plugin, ios/App/App/AppleSignInPlugin.swift), and sends Apple's identity token plus the
// RAW nonce to Supabase (`signInWithIdToken`). Supabase checks that the token's nonce is the hash of
// the raw one, so a token captured elsewhere can't be replayed. The browser Supabase client then
// writes the same session cookies the email code path does, so every server page and route sees an
// ordinary signed-in user — nothing on the server knows or cares which way they signed in.
//
// Accounts: Supabase links an Apple sign-in to an existing account only when both carry the same
// VERIFIED email (its automatic linking). "Hide My Email" gives a relay address, which matches
// nothing, so it would quietly become a second account. `isFirstSignIn` lets the sign-in page stop
// and ask before that new account is used (see login/AppleSignIn.tsx).

import { registerPlugin } from "@capacitor/core";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type AppleCredential = { identityToken: string; authorizationCode?: string };
type AppleSignInPlugin = { authorize(options: { nonce: string }): Promise<AppleCredential> };

const AppleSignIn = registerPlugin<AppleSignInPlugin>("AppleSignIn");

/** Sign in with Apple is shown only once it can work: an Apple Developer membership, the Apple
 *  provider in Supabase, and a build signed with the entitlement. Until then every Apple button is
 *  hidden and Email code is the only way in. Turn on with NEXT_PUBLIC_APPLE_SIGNIN=on (build time). */
export const APPLE_SIGNIN_ENABLED = process.env.NEXT_PUBLIC_APPLE_SIGNIN === "on";

/** A raw nonce and its SHA-256 hex digest (what Apple receives). */
export async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

/** Opens Apple's sheet. Rejects with code "canceled" when the person closes it. */
export async function appleCredential(hashedNonce: string): Promise<AppleCredential> {
  return AppleSignIn.authorize({ nonce: hashedNonce });
}

export type AppleSignInResult =
  | { ok: true; user: User; firstSignIn: boolean; authorizationCode: string | null }
  | { ok: false; canceled: boolean; message: string };

/** Sign in (or link, when `link` is true and someone is signed in) with Apple. */
export async function signInWithApple(
  supabase: SupabaseClient,
  { link = false, captchaToken }: { link?: boolean; captchaToken?: string | null } = {},
): Promise<AppleSignInResult> {
  const nonce = await makeNonce();
  let credential: AppleCredential;
  try {
    credential = await appleCredential(nonce.hashed);
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    // Codes only (canceled / failed / UNIMPLEMENTED …) — never a token.
    if (code !== "canceled") console.warn("[apple] native sign-in failed", String(code ?? (error as Error)?.name ?? "unknown"));
    return { ok: false, canceled: code === "canceled", message: "Sign in with Apple didn't finish. Please try again, or use your email." };
  }
  const args = { provider: "apple" as const, token: credential.identityToken, nonce: nonce.raw };
  // With CAPTCHA protection on in Supabase, a sign-in (not a link, which needs a session) carries the
  // same Turnstile token the email path does.
  const { data, error } = link
    ? await supabase.auth.linkIdentity(args)
    : await supabase.auth.signInWithIdToken({ ...args, ...(captchaToken ? { options: { captchaToken } } : {}) });
  const user = data && "user" in data ? data.user : null;
  if (error || !user) {
    // Supabase's message only goes to the console (it can name configuration); the person gets a plain one.
    console.warn("[apple] supabase refused the Apple token", error?.code ?? error?.status ?? "no_user");
    return {
      ok: false,
      canceled: false,
      message: link
        ? "Couldn't link Apple to this account. If that Apple ID already has its own account here, delete that one first."
        : "Apple sign-in isn't available right now. Please use your email.",
    };
  }
  return { ok: true, user, firstSignIn: !link && isFirstSignIn(user), authorizationCode: credential.authorizationCode ?? null };
}

/** True when this sign-in just CREATED the account: one identity, and the account is as old as
 *  this sign-in. An Apple sign-in that was linked to an existing email account has two identities
 *  (or an older creation time), so it is never treated as new. */
export function isFirstSignIn(user: Pick<User, "created_at" | "last_sign_in_at" | "identities">): boolean {
  if ((user.identities?.length ?? 0) > 1) return false;
  const created = Date.parse(user.created_at);
  const signedIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : created;
  return Number.isFinite(created) && Number.isFinite(signedIn) && Math.abs(signedIn - created) < 60_000;
}

/** Apple's "Hide My Email" relay addresses. */
export function isPrivateRelayEmail(email: string | null | undefined): boolean {
  return !!email && /@privaterelay\.appleid\.com$/i.test(email.trim());
}
