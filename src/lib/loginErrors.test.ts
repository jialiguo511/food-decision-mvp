import { describe, expect, it } from "vitest";
import { callbackErrorMessage, cleanCode, isPlausibleCode, resendSecondsLeft, RESEND_COOLDOWN_SECONDS, sendLinkErrorMessage, turnstileProblemMessage, verifyCodeErrorMessage } from "./loginErrors";

describe("sendLinkErrorMessage — one plain sentence per cause, never the vendor's text", () => {
  it("rate limits", () => {
    for (const e of [{ status: 429, message: "x" }, { code: "over_email_send_rate_limit", message: "email rate limit exceeded" }, { message: "For security purposes, you can only request this after 41 seconds." }]) {
      expect(sendLinkErrorMessage(e)).toMatch(/wait a minute/i);
    }
  });
  it("captcha, bad address, closed sign-ups, network, and anything else", () => {
    expect(sendLinkErrorMessage({ message: "captcha verification process failed" })).toMatch(/rejected the check/i);
    expect(sendLinkErrorMessage({ code: "validation_failed", message: "Unable to validate email address: invalid format" })).toMatch(/email address/i);
    expect(sendLinkErrorMessage({ message: "Signups not allowed for otp" })).toMatch(/closed/i);
    expect(sendLinkErrorMessage({ message: "Failed to fetch" })).toMatch(/connection/i);
    expect(sendLinkErrorMessage({ message: "Database error saving new user" })).toMatch(/Couldn't send the link/);
    expect(sendLinkErrorMessage(null)).toMatch(/Couldn't send the link/);
  });
  it("does not echo the vendor's message", () => {
    expect(sendLinkErrorMessage({ message: "Database error saving new user" })).not.toMatch(/database/i);
  });
});

describe("turnstileProblemMessage — the check's real failure, with its code and a way forward", () => {
  const host = "app-git-x.vercel.app";
  it("a blocked or failed script is a network/blocker problem, not 'not finished'", () => {
    const m = turnstileProblemMessage({ stage: "script", code: null }, host);
    expect(m).toMatch(/challenges\.cloudflare\.com/);
    expect(m).toMatch(/script not loaded/);
  });
  it("110200 names the host and says it is the site owner's setting", () => {
    const m = turnstileProblemMessage({ stage: "widget", code: "110200" }, host);
    expect(m).toContain(host);
    expect(m).toMatch(/site owner/i);
    expect(m).toContain("code 110200");
  });
  it("other families get their own advice, and an unknown code is still shown", () => {
    expect(turnstileProblemMessage({ stage: "widget", code: "110100" }, host)).toMatch(/key/i);
    expect(turnstileProblemMessage({ stage: "widget", code: "110510" }, host)).toMatch(/browser/i);
    expect(turnstileProblemMessage({ stage: "widget", code: "200100" }, host)).toMatch(/clock/i);
    expect(turnstileProblemMessage({ stage: "widget", code: "300030" }, host)).toMatch(/VPN/);
    expect(turnstileProblemMessage({ stage: "widget", code: "999999" }, host)).toContain("code 999999");
  });
  it("never mentions a token, and never says 'below'", () => {
    for (const code of ["110200", "300030", null, "unsupported"]) {
      const m = turnstileProblemMessage({ stage: "widget", code }, host);
      expect(m).not.toMatch(/token|below/i);
    }
  });
});

describe("the callback notice and the resend timer", () => {
  it("explains an expired link, including the same-browser rule", () => {
    expect(callbackErrorMessage("link_expired")).toMatch(/same browser|browser you asked from/i);
    expect(callbackErrorMessage("link_expired")).toMatch(/code/i); // the way out that works anywhere
    expect(callbackErrorMessage(null)).toBeNull();
    expect(callbackErrorMessage("<script>")).toBeNull();
  });
  it("counts the resend cooldown down to zero and no further", () => {
    expect(resendSecondsLeft(null, 1_000)).toBe(0);
    expect(resendSecondsLeft(1_000, 1_000)).toBe(RESEND_COOLDOWN_SECONDS);
    expect(resendSecondsLeft(1_000, 1_000 + 20_000)).toBe(RESEND_COOLDOWN_SECONDS - 20);
    expect(resendSecondsLeft(1_000, 1_000 + 61_000)).toBe(0);
  });
});

describe("one-time code entry", () => {
  it("accepts a pasted code with spaces or dashes, 6 to 10 digits, and nothing else", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
    expect(isPlausibleCode("123456")).toBe(true);
    expect(isPlausibleCode("12345678")).toBe(true);
    expect(isPlausibleCode("12345")).toBe(false);
    expect(isPlausibleCode("12345678901")).toBe(false);
    expect(isPlausibleCode("abcdef")).toBe(false);
    expect(isPlausibleCode("")).toBe(false);
  });
  it("one plain sentence per failure, never the vendor's text", () => {
    expect(verifyCodeErrorMessage({ status: 429, message: "x" })).toMatch(/too many/i);
    expect(verifyCodeErrorMessage({ code: "otp_expired", message: "Token has expired or is invalid" })).toMatch(/didn't work.*send another/i);
    expect(verifyCodeErrorMessage({ message: "Failed to fetch" })).toMatch(/connection/i);
    expect(verifyCodeErrorMessage(null)).toMatch(/Couldn't check that code/);
    expect(verifyCodeErrorMessage({ code: "otp_expired", message: "Token has expired or is invalid" })).not.toMatch(/token/i);
  });
});
