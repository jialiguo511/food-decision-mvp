// The feedback form's contract — one place, used by the server action and by the page.
//
// What is stored (supabase/migrations/2026-11-09_*): the kind, the message, a contact
// the person chose to type, the page they came from (a path, never a query string) and
// the app version. Nothing is attached automatically beyond the last two: no screenshot,
// no Profile, no recent requests, and not the sentence typed on Home.

export const FEEDBACK_KINDS = [
  { value: "bug", label: "Something's broken" },
  { value: "idea", label: "An idea" },
  { value: "other", label: "Something else" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];

export const FEEDBACK_MAX_MESSAGE = 2000;
export const FEEDBACK_MAX_CONTACT = 200;

export type FeedbackInput = { kind: unknown; message: unknown; contact?: unknown; page?: unknown };
export type CleanFeedback = { kind: FeedbackKind; message: string; contact: string | null; page: string | null };

/** The page a person came from, as a bare path ("/saved") — or null. Query strings and
 *  fragments are dropped (a URL can carry things that are not ours to keep). */
export function feedbackPage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/)[0];
  return /^\/[a-z0-9/_-]{0,60}$/i.test(path) && !path.startsWith("//") ? path : null;
}

export function validateFeedback(input: FeedbackInput): { ok: true; value: CleanFeedback } | { ok: false; error: string } {
  const kind = FEEDBACK_KINDS.find((k) => k.value === input.kind)?.value;
  if (!kind) return { ok: false, error: "Pick what kind of feedback this is." };
  if (typeof input.message !== "string") return { ok: false, error: "Write a few words first." };
  const message = input.message.trim();
  if (message.length === 0) return { ok: false, error: "Write a few words first." };
  if (message.length > FEEDBACK_MAX_MESSAGE) return { ok: false, error: `That's a bit long — please keep it under ${FEEDBACK_MAX_MESSAGE} characters.` };
  let contact: string | null = null;
  if (typeof input.contact === "string" && input.contact.trim()) {
    contact = input.contact.trim().replace(/\s+/g, " ");
    if (contact.length > FEEDBACK_MAX_CONTACT) return { ok: false, error: "That contact is too long." };
  }
  return { ok: true, value: { kind, message, contact, page: feedbackPage(input.page) } };
}

/** The deployed commit, short — so a report says which build it is about. "dev" when unknown. */
export function appVersion(env: Record<string, string | undefined> = process.env): string {
  const sha = (env.VERCEL_GIT_COMMIT_SHA ?? env.NEXT_PUBLIC_APP_VERSION ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : "dev";
}
