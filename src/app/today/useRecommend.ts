"use client";

import { useEffect, useRef, useState } from "react";
import type { ActiveSession, DecisionContext, RecommendFailure, RecommendSuccess } from "@/lib/types";
import { chooseRecommendation } from "./actions";

export type Selection =
  | { status: "none" }
  | { status: "choosing"; index: 0 | 1 | 2 }
  | { status: "chosen"; index: 0 | 1 | 2 }
  | { status: "failed"; index: 0 | 1 | 2; message: string };

type RequestStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; error: RecommendFailure["error"] };

/**
 * Owns the Today recommendation flow: at most one in-flight
 * POST /api/recommend at a time, the currently active session (freshly
 * generated, regenerated, or restored from the database), and the selection
 * made against it.
 *
 * `session` and `request` are deliberately separate pieces of state. A failed
 * regenerate only touches `request` — the last successful `session` (and its
 * selection) is left alone, so the UI can keep showing it. Every *successful*
 * call to `run` — first generation, "Regenerate recommendations", or "Show me
 * 3 more" — replaces `session` with a new one and resets `selection`, because
 * each is a new decision_sessions row with chosen_index starting null.
 *
 * `run` and `choose` must be called from event handlers, never from an
 * effect. That is what keeps each to exactly one request per click: React
 * Strict Mode double-invokes effects, not event handlers, and the ref flags
 * below additionally block a second call landing before the state update
 * that disables the button has re-rendered — a synchronous guard, so it also
 * covers a rapid double click within the same render.
 */
export function useRecommend(initial: { session: ActiveSession | null; chosenIndex: 0 | 1 | 2 | null }) {
  const [session, setSession] = useState<ActiveSession | null>(initial.session);
  const [selection, setSelection] = useState<Selection>(
    initial.chosenIndex === null ? { status: "none" } : { status: "chosen", index: initial.chosenIndex },
  );
  const [request, setRequest] = useState<RequestStatus>({ kind: "idle" });

  const inFlight = useRef(false);
  const choosingInFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  // What "Try again" resends after a failed run — the exact request that
  // specific attempt made, whether that was the first generate, a regenerate
  // with edited fields, or "Show me 3 more" with the prior context and
  // recommendations attached as exclusions.
  const lastRequest = useRef<{ context: DecisionContext; previousRecommendations?: ActiveSession["recommendations"] } | null>(
    null,
  );
  // Lets `choose` notice its session changed (a regenerate landed) while its
  // own request was still in flight, so it doesn't apply a stale result.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Unmounting mid-request shouldn't try to setState afterwards.
  useEffect(() => () => controller.current?.abort(), []);

  /** `previousRecommendations` is only ever passed by "Show me 3 more" — see
   *  TodayForm. Anything else (first generate, "Regenerate recommendations")
   *  omits it, so the request and the resulting prompt are unchanged. */
  async function run(context: DecisionContext, previousRecommendations?: ActiveSession["recommendations"]) {
    if (inFlight.current) return;
    inFlight.current = true;
    lastRequest.current = { context, previousRecommendations };
    const signal = (controller.current = new AbortController()).signal;

    setRequest({ kind: "loading" });
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, previous_recommendations: previousRecommendations }),
        signal,
      });
      const body: unknown = await response.json();
      if (response.ok && isSuccess(body)) {
        // A new decision_sessions row — chosen_index starts null on the
        // server, so selection resets here to match.
        setSession({ session_id: body.session_id, context, recommendations: body.recommendations });
        setSelection({ status: "none" });
        setRequest({ kind: "idle" });
      } else if (isFailure(body)) {
        setRequest({ kind: "error", error: body.error });
      } else {
        setRequest({
          kind: "error",
          error: { code: "upstream_error", message: `Unexpected response (HTTP ${response.status}).` },
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRequest({
        kind: "error",
        error: { code: "upstream_error", message: error instanceof Error ? error.message : "Request failed." },
      });
    } finally {
      inFlight.current = false;
    }
  }

  async function choose(index: 0 | 1 | 2) {
    if (!session) return;
    if (selection.status === "chosen") return;
    if (choosingInFlight.current) return;
    choosingInFlight.current = true;

    const sessionId = session.session_id;
    setSelection({ status: "choosing", index });
    try {
      const result = await chooseRecommendation(sessionId, index);
      // A regenerate may have replaced the session while this was in flight;
      // don't mark a since-abandoned session as chosen.
      if (sessionRef.current?.session_id !== sessionId) return;
      setSelection(
        result.ok ? { status: "chosen", index: result.chosenIndex } : { status: "failed", index, message: result.error },
      );
    } catch (error) {
      if (sessionRef.current?.session_id !== sessionId) return;
      setSelection({
        status: "failed",
        index,
        message: error instanceof Error ? error.message : "Couldn't save your choice.",
      });
    } finally {
      choosingInFlight.current = false;
    }
  }

  function retry() {
    if (lastRequest.current) void run(lastRequest.current.context, lastRequest.current.previousRecommendations);
  }

  return { session, selection, request, run, retry, choose };
}

function isFailure(value: unknown): value is RecommendFailure {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const { error } = value;
  return typeof error === "object" && error !== null && "code" in error && "message" in error;
}

function isSuccess(value: unknown): value is RecommendSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    "recommendations" in value &&
    Array.isArray(value.recommendations) &&
    // Three — or 0–3 for a strict "Use what I have" request, where the
    // user's ingredients may support fewer, or none. The server has already
    // validated it.
    value.recommendations.length <= 3 &&
    "session_id" in value &&
    typeof value.session_id === "string"
  );
}
