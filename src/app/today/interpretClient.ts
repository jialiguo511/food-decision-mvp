// The browser's side of "tell me what's going on": send the sentence, get the
// record back (or one plain-language reason it didn't work). The text lives only
// in this call and in Home's memory — nothing here stores or logs it.

import { INTERPRET_MAX_CHARS, type AdjustingWay, type Interpretation, type InterpretErrorCode } from "@/lib/interpret/schema";

export type InterpretResult = { ok: true; interpretation: Interpretation } | { ok: false; error: InterpretErrorCode | "network" };

const CLIENT_TIMEOUT_MS = 25_000;

export async function interpretText(text: string, adjusting?: AdjustingWay): Promise<InterpretResult> {
  if (text.trim().length > INTERPRET_MAX_CHARS) return { ok: false, error: "too_long" };
  try {
    const response = await fetch("/api/recommend/interpret", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `adjusting` is only the way the request on screen is in ("cook", "order"…), so an amount
      // lands in the right field — none of its answers go with it.
      body: JSON.stringify(adjusting ? { text, adjusting } : { text }),
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(CLIENT_TIMEOUT_MS) : undefined,
    });
    const data = (await response.json().catch(() => null)) as { interpretation?: Interpretation; error?: InterpretErrorCode } | null;
    if (response.ok && data?.interpretation) return { ok: true, interpretation: data.interpretation };
    return { ok: false, error: data?.error ?? "unavailable" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** One short, honest line for each way it can fail. Every one keeps the text
 *  and points at the step-by-step path. */
export function interpretErrorCopy(error: InterpretErrorCode | "network"): string {
  switch (error) {
    case "empty":
      return "Write a few words about what you need first.";
    case "too_long":
      return `That's a bit long — a sentence or two is plenty (up to ${INTERPRET_MAX_CHARS} characters).`;
    case "nothing_found":
      return "I couldn't pick anything out of that. Add a few words about what you need, or choose step by step.";
    case "unauthenticated":
      return "You've been signed out. Sign in again in a new tab, then come back here — your text is still in the box.";
    case "paused":
      return "Reading a typed sentence is unavailable right now. Your text is still here — you can choose step by step instead.";
    case "limit_reached":
      return "You've used today's quota for describing your situation. You can still choose step by step.";
    default:
      return "Couldn't read that just now. Your text is still here — try again, or choose step by step.";
  }
}

/** The same, for a change asked on results already on screen: the old results stay, the text stays. */
export function adjustErrorCopy(error: InterpretErrorCode | "network"): string {
  switch (error) {
    case "empty":
      return "Write what should change first.";
    case "too_long":
      return `That's a bit long — a sentence is plenty (up to ${INTERPRET_MAX_CHARS} characters).`;
    case "nothing_found":
      return "I couldn't tell what to change. Say it another way — for example “I'll cook a proper meal” or “same, but under $10” — or use a one-tap change.";
    case "unauthenticated":
      return "You've been signed out. Sign in again in a new tab, then press Update — your text is still here.";
    case "paused":
      return "Changing by text is unavailable right now. Your text is still here; the one-tap changes and editing the answers still work.";
    case "limit_reached":
      return "You've used today's quota for describing changes. The one-tap changes and editing the answers still work.";
    default:
      return "Couldn't read that just now. Your text is still here — try again, or use a one-tap change.";
  }
}
