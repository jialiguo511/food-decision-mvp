"use server";

// Send feedback. Signed-in only, rate-limited like a paid call (a public sign-up must
// not be able to fill the table), validated on the server whatever the form did, and
// one insert under the person's own session — Row Level Security makes the row theirs.

import { appVersion, validateFeedback, type FeedbackInput } from "@/lib/feedback";
import { createClient } from "@/lib/supabase/server";
import { consumeUsage } from "@/lib/usage/consume";

export type FeedbackResult = { ok: true } | { ok: false; error: string };

export async function submitFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const checked = validateFeedback(typeof input === "object" && input !== null ? input : { kind: undefined, message: undefined });
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You are signed out. Please sign in again — your message is still in the box." };

  const usage = await consumeUsage(supabase, "feedback");
  if (!usage.allowed) {
    return {
      ok: false,
      error: usage.reason === "limit" ? "You've sent a few messages today already — thank you. Please try again tomorrow." : "Feedback is unavailable right now. Please try again later.",
    };
  }

  const { kind, message, contact, page } = checked.value;
  const { error } = await supabase.from("feedback").insert({ user_id: user.id, kind, message, contact, page, app_version: appVersion() });
  if (error) {
    console.error("[feedback] couldn't store a message", { code: error.code });
    return { ok: false, error: "Couldn't send that. Please try again." };
  }
  return { ok: true };
}
