// Revoking a person's Sign in with Apple authorization when they delete their account — App Store
// Review Guideline 5.1.1(v) asks apps that offer Sign in with Apple to do this.
//
// How, without storing any Apple token: at deletion time the iOS app asks Apple for a fresh
// authorization code (the person confirms with Face ID), the server exchanges it for a refresh token
// and immediately revokes that token. Nothing is kept. Needs four server-only settings:
//   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_SIGNIN_PRIVATE_KEY (the .p8 key's PEM text; "\n" escapes are
//   fine), APPLE_CLIENT_ID (the app's bundle id).
// Without them, deletion still completes and the log says revocation was skipped.

import { createPrivateKey, sign } from "node:crypto";

export type AppleRevokeConfig = { teamId: string; keyId: string; privateKey: string; clientId: string };
export type RevokeOutcome = "revoked" | "not_configured" | "exchange_failed" | "revoke_failed";

export function appleRevokeConfig(env: Record<string, string | undefined> = process.env): AppleRevokeConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const privateKey = env.APPLE_SIGNIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  const clientId = env.APPLE_CLIENT_ID?.trim();
  return teamId && keyId && privateKey && clientId ? { teamId, keyId, privateKey, clientId } : null;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** The short-lived ES256 JWT Apple accepts as a client secret. */
export function appleClientSecret(config: AppleRevokeConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const payload = b64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: "https://appleid.apple.com", sub: config.clientId }));
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key: createPrivateKey(config.privateKey), dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** Exchange the code, revoke the refresh token. Never throws; never logs a token. */
export async function revokeAppleAuthorization(code: string, config = appleRevokeConfig(), fetchImpl: typeof fetch = fetch): Promise<RevokeOutcome> {
  if (!config) return "not_configured";
  try {
    const secret = appleClientSecret(config);
    const tokenRes = await fetchImpl("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: secret, code, grant_type: "authorization_code" }),
    });
    const tokens = (await tokenRes.json().catch(() => null)) as { refresh_token?: unknown } | null;
    if (!tokenRes.ok || typeof tokens?.refresh_token !== "string") return "exchange_failed";
    const revokeRes = await fetchImpl("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: secret, token: tokens.refresh_token, token_type_hint: "refresh_token" }),
    });
    return revokeRes.ok ? "revoked" : "revoke_failed";
  } catch {
    return "exchange_failed";
  }
}
