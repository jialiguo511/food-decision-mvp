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
    return "The sign-in service rejected the check. Please try again with a fresh check; if it keeps happening, the site's check keys are probably mismatched — that's for the site owner to fix.";
  }
  if (text.includes("invalid") && text.includes("email")) return "That email address doesn't look right. Please check it and try again.";
  if (text.includes("signups not allowed") || text.includes("signup_disabled")) return "New sign-ups are closed right now. Please try again later.";
  if (text.includes("failed to fetch") || text.includes("network")) return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't send the link. Please check the address and try again in a moment.";
}

/** Why the human check could not run: Cloudflare's error-callback code, or the script never loaded. */
export type TurnstileProblem = { stage: "script" | "widget"; code: string | null };

/**
 * One plain sentence per cause, with the real code so it can be reported. The codes are
 * Cloudflare's documented client-side error families; anything unlisted gets a generic
 * retry sentence plus its code. Never receives or shows a token.
 */
export function turnstileProblemMessage(problem: TurnstileProblem, host: string): string {
  const code = problem.code ?? "";
  const tag = problem.stage === "script" ? "(script not loaded)" : code ? `(code ${code})` : "";
  let text: string;
  if (problem.stage === "script" || code.startsWith("200500")) {
    text =
      "The check couldn't load from Cloudflare (challenges.cloudflare.com). A content blocker, VPN, firewall or a slow connection may be blocking it. Allow that address or try another network, then retry.";
  } else if (code.startsWith("110200")) {
    text = `The check isn't enabled for this address${host ? ` (${host})` : ""}. That's a site setting, not something you did — the site owner has to add this exact hostname to the check's allowed hostnames.`;
  } else if (code.startsWith("1101") || code.startsWith("1100")) {
    text = "The check's key for this site is not valid. That's a site setting — the site owner has to correct it.";
  } else if (code === "unsupported" || code.startsWith("1105")) {
    text = "This browser can't run the check. Try an up-to-date browser.";
  } else if (code.startsWith("2001")) {
    text = "The check failed because this device's clock looks wrong. Set the date and time to automatic, then retry.";
  } else if (code.startsWith("300") || code.startsWith("600")) {
    text = "The check couldn't confirm you from this browser or network. Retry; if it keeps failing, turn off a VPN or content blocker, or use another browser.";
  } else {
    text = "The check hit a problem. Please retry, or reload the page.";
  }
  return tag ? `${text} ${tag}` : text;
}

/** The sign-in page's notice for `/login?error=…`, set by /auth/callback. */
export function callbackErrorMessage(code: string | null | undefined): string | null {
  if (code === "link_expired") {
    return "That sign-in link didn't work. A link can be used once, expires after a while, and only works in the browser you asked from — Gmail's built-in browser isn't that one. Request a new email below and type the code from it instead; the code works anywhere.";
  }
  return null;
}

/** A one-time code is digits only (Supabase allows 6–10). Pasting "123 456" or "123-456" must work. */
export function cleanCode(input: string): string {
  return input.replace(/\D/g, "");
}
export function isPlausibleCode(input: string): boolean {
  const digits = cleanCode(input);
  return digits.length >= 6 && digits.length <= 10;
}

/** Why a typed code didn't sign the person in — one plain sentence and the next step. */
export function verifyCodeErrorMessage(error: AuthLikeError): string {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (error?.status === 429 || text.includes("rate") || text.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (text.includes("expired") || text.includes("invalid") || error?.status === 403 || error?.status === 400 || error?.status === 422) {
    return "That code didn't work. Codes expire after a while and work once — check the newest email, or send another code.";
  }
  if (text.includes("failed to fetch") || text.includes("network")) return "Couldn't reach the server. Check your connection and try again.";
  return "Couldn't check that code. Please try again, or send another one.";
}

/** Seconds left on the resend timer; 0 when it can be used. */
export function resendSecondsLeft(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - (now - sentAt) / 1000));
}
