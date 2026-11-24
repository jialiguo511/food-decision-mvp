import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { appleClientSecret, appleRevokeConfig, revokeAppleAuthorization } from "./appleRevoke";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const config = {
  teamId: "TEAM123456",
  keyId: "KEY1234567",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  clientId: "com.example.app",
};

describe("Apple client secret", () => {
  it("is an ES256 JWT Apple can verify with the key's public half", () => {
    const jwt = appleClientSecret(config, 1_000);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_000, exp: 1_300, aud: "https://appleid.apple.com", sub: "com.example.app" });
    expect(verify("sha256", Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"))).toBe(true);
  });

  it("reads config only when all four settings exist, and accepts \\n-escaped keys", () => {
    expect(appleRevokeConfig({})).toBeNull();
    const env = { APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_SIGNIN_PRIVATE_KEY: "-----BEGIN-----\\nabc", APPLE_CLIENT_ID: "c" };
    expect(appleRevokeConfig(env)?.privateKey).toBe("-----BEGIN-----\nabc");
  });
});

describe("revoking at account deletion", () => {
  it("exchanges the code, then revokes the refresh token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ refresh_token: "r1" }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(await revokeAppleAuthorization("code1", config, fetchImpl)).toBe("revoked");
    expect(String(fetchImpl.mock.calls[1][1].body)).toContain("token=r1");
    expect(String(fetchImpl.mock.calls[1][1].body)).toContain("token_type_hint=refresh_token");
  });

  it("reports each failure without throwing", async () => {
    expect(await revokeAppleAuthorization("c", null)).toBe("not_configured");
    expect(await revokeAppleAuthorization("c", config, vi.fn().mockResolvedValueOnce(Response.json({ error: "invalid_grant" }, { status: 400 })))).toBe("exchange_failed");
    expect(
      await revokeAppleAuthorization("c", config, vi.fn().mockResolvedValueOnce(Response.json({ refresh_token: "r" })).mockResolvedValueOnce(new Response(null, { status: 400 }))),
    ).toBe("revoke_failed");
    expect(await revokeAppleAuthorization("c", config, vi.fn().mockRejectedValueOnce(new Error("offline")))).toBe("exchange_failed");
  });
});
