import { describe, expect, it } from "vitest";
import { callbackUrl, isValidState, readCallback } from "./appCheck";

const STATE = "a".repeat(43);
const TOKEN = "0.abcdefghijklmnopqrstuvwxyz-_ABC";

describe("sign-in check bridge", () => {
  it("round-trips the token only for the state the app is waiting for", () => {
    const url = callbackUrl(STATE, TOKEN);
    expect(url.startsWith("whattoeat-auth://check#")).toBe(true);
    expect(url).not.toContain("?");
    expect(readCallback(url, STATE)).toEqual({ ok: true, token: TOKEN });
  });

  it("drops a callback for another state, scheme, or a malformed token", () => {
    expect(readCallback(callbackUrl(STATE, TOKEN), "b".repeat(43))).toEqual({ ok: false, reason: "state" });
    expect(readCallback(`https://evil.example/#state=${STATE}&token=${TOKEN}`, STATE)).toEqual({ ok: false, reason: "scheme" });
    expect(readCallback(`whattoeat-auth://check#state=${STATE}&token=a%20b`, STATE)).toEqual({ ok: false, reason: "token" });
    expect(readCallback("not a url", STATE)).toEqual({ ok: false, reason: "scheme" });
  });

  it("accepts only a 43-char base64url state", () => {
    expect(isValidState(STATE)).toBe(true);
    expect(isValidState("short")).toBe(false);
    expect(isValidState("a".repeat(42) + "/")).toBe(false);
  });
});
