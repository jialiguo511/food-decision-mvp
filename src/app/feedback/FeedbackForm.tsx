"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import Button, { buttonClass } from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import { FEEDBACK_KINDS, FEEDBACK_MAX_CONTACT, FEEDBACK_MAX_MESSAGE, type FeedbackKind } from "@/lib/feedback";
import { submitFeedback } from "./actions";

/** Type, text, an optional way to reach you. The page you came from and the app version are
 *  attached (shown below the button); nothing else is. One send at a time. */
export default function FeedbackForm({ page }: { page: string | null }) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setState("sending");
    setError(null);
    try {
      const result = await submitFeedback({ kind, message, contact, page });
      if (result.ok) {
        setState("sent");
        return;
      }
      setError(result.error);
    } catch {
      setError("Couldn't send that. Please try again.");
    }
    setState("idle");
    inFlight.current = false;
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-3xl border border-line bg-card p-5">
        <p className="text-base font-semibold">Thank you — got it.</p>
        <p className="mt-1 text-sm text-muted">I read these. If you left a way to reach you, I may follow up.</p>
        <Link href="/today" className={buttonClass("primary", "mt-4")}>
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What is it?</legend>
        <div className="flex flex-wrap gap-2">
          {FEEDBACK_KINDS.map((option) => (
            <Chip key={option.value} label={option.label} selected={kind === option.value} onClick={() => setKind(option.value)} />
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="feedback-message" className="mb-2 block text-sm font-medium">
          {kind === "bug" ? "What happened? What did you expect?" : "Tell me more"}
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={FEEDBACK_MAX_MESSAGE}
          rows={6}
          required
          className="block w-full resize-y rounded-2xl border border-line bg-card p-4 text-base leading-relaxed outline-none focus:border-accent"
        />
        <p className="mt-1 px-1 text-right text-xs text-muted">
          {message.length}/{FEEDBACK_MAX_MESSAGE}
        </p>
      </div>

      <div>
        <label htmlFor="feedback-contact" className="mb-2 block text-sm font-medium">
          How can I reach you? <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="feedback-contact"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          maxLength={FEEDBACK_MAX_CONTACT}
          autoComplete="email"
          placeholder="Email, if you want a reply"
          className="block w-full rounded-2xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-accent"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <Button type="submit" disabled={state === "sending" || message.trim().length === 0}>
        {state === "sending" ? "Sending…" : "Send"}
      </Button>
      <p className="text-xs leading-relaxed text-muted">
        Sent with your message: the page you came from{page ? ` (${page})` : ""} and this app&apos;s version. Nothing else — no screenshot, and not what you typed on Home. You can delete it
        any time with <em>Reset my data</em> or <em>Delete my account</em> in Me.
      </p>
    </form>
  );
}
