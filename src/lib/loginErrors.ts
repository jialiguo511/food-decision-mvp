// What to tell someone when asking for a sign-in link fails, and when a link that was
// clicked doesn't work. Supabase's own messages are written for developers
// ("email rate limit exceeded", "captcha verification process failed"); here each cause
// gets one plain sentence and, where there is one, the next step.

export const RESEND_COOLDOWN_SECONDS = 60;

type AuthLikeError = { message?: string; status?: number; code?: string } | null | undefined;

export function sendLinkErrorMessage(error: AuthLikeError): string {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (error?.status === 429 || text.includes("rate") || text.includes("too many") || text.includes("seconds")) {
    return "Too many sign-in emails were requested just now. Please wait a minute and try again.";
  }
  if (text.includes("captcha")) {
    return "We couldn't confirm you're a person. Please try the check again, or reload the page.";
  }
  if (text.includes("invalid") && text.includes("email")) return "That email address doesn't look right. Please check it and try again.";
  if (text.includes("signups not allowed") || text.includes("signup_disabled")) return "New sign-ups are closed right now. Please try again later.";
  if (text.includes("failed to fetch") || text.includes("network")) return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't send the link. Please check the address and try again in a moment.";
}

/** The sign-in page's notice for `/login?error=…`, set by /auth/callback. */
export function callbackErrorMessage(code: string | null | undefined): string | null {
  if (code === "link_expired") {
    return "That sign-in link didn't work. Links stop working after a while and can be used once — and must be opened in the same browser you asked from. Request a new one below.";
  }
  return null;
}

/** Seconds left on the resend timer; 0 when it can be used. */
export function resendSecondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - (now - sentAt) / 1000));
}
