import { describe, expect, it } from "vitest";
import { callbackErrorMessage, resendSecondsLeft, RESEND_COOLDOWN_SECONDS, sendLinkErrorMessage } from "./loginErrors";

describe("sendLinkErrorMessage — one plain sentence per cause, never the vendor's text", () => {
  it("rate limits", () => {
    for (const e of [{ status: 429, message: "x" }, { code: "over_email_send_rate_limit", message: "email rate limit exceeded" }, { message: "For security purposes, you can only request this after 41 seconds." }]) {
      expect(sendLinkErrorMessage(e)).toMatch(/wait a minute/i);
    }
  });
  it("captcha, bad address, closed sign-ups, network, and anything else", () => {
    expect(sendLinkErrorMessage({ message: "captcha verification process failed" })).toMatch(/person/i);
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

describe("the callback notice and the resend timer", () => {
  it("explains an expired link, including the same-browser rule", () => {
    expect(callbackErrorMessage("link_expired")).toMatch(/same browser/i);
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
