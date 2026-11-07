// The recommendation request, session and selection — held OUTSIDE React so
// they outlive Home.
//
// The bug this fixes: they used to be component state in Home, and the request
// was aborted when Home unmounted. Switching to another tab while "Finding a few
// good options…" was running and coming back rebuilt Home from the server's
// last SAVED session — so it showed the previous (stale) cards as if they were
// the current answer, while the real request had been dropped on the floor.
//
// The rule now, deterministic: the request is a property of the signed-in user
// in this browser tab, not of the screen that happens to show it.
//   - Navigating away never cancels it, and never starts a second one.
//   - Coming back shows what the store says: still loading → the loading state,
//     finished → its cards, failed → its error. Never the older page content.
//   - Only a fresh-enough session (the same 6 h window as a server restore) or
//     an in-flight / failed request counts; otherwise Home falls back to the
//     server's restored session, exactly as on a first visit.
//   - State belongs to a user id: another account in the same tab starts clean.
// Mutated only from event handlers (never during render, never on the server),
// so nothing leaks between users on the server.
//
// Identity. Every explicit submit gets a requestId. The store holds exactly one
// ACTIVE request; every await in `run` re-checks "am I still the active
// request?" before touching state, so a response that arrives late — after a
// newer submit replaced it, or after another user signed in — is dropped, never
// applied. Submitting a *different* request supersedes (and aborts) the active
// one; submitting the *same* request again (a double tap, a remounted button)
// is the same request and sends nothing. A component remounting is never intent:
// nothing here, and nothing that reads the store, starts a request on its own.

import { LocationError, requestLocation } from "@/lib/location";
import { contextsEqual } from "@/lib/recommend/contextEquality";
import { newRequestId, requestLog } from "@/lib/recommend/requestLog";
import { SESSION_RESTORE_WINDOW_MS } from "@/lib/recommend/sessionWindow";
import type { ActiveSession, DecisionContext, RecommendFailure, RecommendSuccess, RecommendUiError } from "@/lib/types";
import { chooseRecommendation, rescoreSession } from "./actions";

export type Selection =
  | { status: "none" }
  | { status: "choosing"; index: 0 | 1 | 2 }
  | { status: "chosen"; index: 0 | 1 | 2 }
  | { status: "failed"; index: 0 | 1 | 2; message: string };

/** `startedAt` (ms epoch) belongs to the request, not to the screen showing it:
 *  a Home that remounts mid-request still knows how long it has been running. */
export type RequestStatus =
  | { kind: "idle" }
  /** Waiting on the browser's location prompt / fix — nearby requests only. */
  | { kind: "locating"; requestId: string; startedAt: number }
  | { kind: "loading"; requestId: string; startedAt: number }
  | { kind: "error"; requestId: string; error: RecommendUiError };

type PreviousRecommendations = ActiveSession["recommendations"];

/** What Home says after the user's nutrition targets changed under a set of
 *  cards: they were re-scored ("updated" when the order moved, "checked" when
 *  it already fit). Tied to the session it describes. */
export type NutritionNotice = { sessionId: string; kind: "updated" | "checked" };

export type Snapshot = {
  /** The user this state belongs to. */
  owner: string | null;
  /** True once this tab has made a request or a choice. */
  touched: boolean;
  session: ActiveSession | null;
  /** When `session` arrived (ms epoch) — for the restore window. */
  sessionAt: number | null;
  selection: Selection;
  request: RequestStatus;
  /** The context of the latest request, for the loading lines and for
   *  "Change" after a failure. */
  requested: DecisionContext | null;
  notice: NutritionNotice | null;
};

const EMPTY: Snapshot = {
  owner: null,
  touched: false,
  session: null,
  sessionAt: null,
  selection: { status: "none" },
  request: { kind: "idle" },
  requested: null,
  notice: null,
};

/** The one request that may write to the store. Replaced (and the old one
 *  aborted) by a different submit; cleared when the owner changes. */
type ActiveRequest = {
  requestId: string;
  controller: AbortController;
  context: DecisionContext;
  previous?: PreviousRecommendations;
  /** Settles when the request has fully finished, however it ended. */
  done: Promise<void>;
};

let snap: Snapshot = EMPTY;
const listeners = new Set<() => void>();
// Bumped when the owner changes, so a response for the previous user is dropped.
let generation = 0;
let active: ActiveRequest | null = null;
let choosingInFlight = false;
/** The latest request's fate, for the development trace only. */
let ledger: { requestId: string; state: "loading" | "stored" | "failed" | "aborted" } | null = null;
/** Sessions whose enrichment / re-score has been asked for — each once. */
const enrichAsked = new Set<string>();
const rescoreAsked = new Set<string>();
let lastRequest: { context: DecisionContext; previous?: PreviousRecommendations } | null = null;

function set(patch: Partial<Snapshot>) {
  snap = { ...snap, ...patch };
  for (const listener of listeners) listener();
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const getSnapshot = () => snap;
/** On the server there is never any state — every request starts empty. */
export const getServerSnapshot = () => EMPTY;

/** Test hook: forget everything, including the in-flight bookkeeping. */
export function resetStore() {
  generation++;
  active?.controller.abort();
  active = null;
  ledger = null;
  snap = EMPTY;
  choosingInFlight = false;
  enrichAsked.clear();
  rescoreAsked.clear();
  lastRequest = null;
  for (const listener of listeners) listener();
}

/** Another user in the same tab: drop the previous user's state entirely. */
function claim(owner: string) {
  if (snap.owner === owner) return;
  generation++;
  if (active) requestLog("abort", { requestId: active.requestId, reason: "owner_changed" });
  active?.controller.abort();
  active = null;
  choosingInFlight = false;
  lastRequest = null;
  snap = { ...EMPTY, owner };
}

// ---------------------------------------------------------------------------
// What Home should show
// ---------------------------------------------------------------------------

export type RecommendView = {
  session: ActiveSession | null;
  selection: Selection;
  request: RequestStatus;
  requested: DecisionContext | null;
  notice: NutritionNotice | null;
  /** True when this tab has a request or a session of its own — Home opens on
   *  the results screen rather than Start. */
  live: boolean;
};

/**
 * The state Home renders: this tab's own, when it has any worth showing, else
 * what the server restored. Pure.
 *
 * "Worth showing" = a request in flight or failed, or a session newer than the
 * restore window. When the server's restored session IS this tab's session, the
 * server copy wins for the session itself (its Saved state is fresher); the
 * selection stays this tab's.
 */
export function viewOf(
  state: Snapshot,
  owner: string,
  initial: { session: ActiveSession | null; chosenIndex: 0 | 1 | 2 | null },
  now: number = Date.now(),
): RecommendView {
  const fromServer: RecommendView = {
    session: initial.session,
    selection: initial.chosenIndex === null ? { status: "none" } : { status: "chosen", index: initial.chosenIndex },
    request: { kind: "idle" },
    requested: null,
    notice: null,
    live: false,
  };
  if (!state.touched || state.owner !== owner) return fromServer;

  const requestPending = state.request.kind !== "idle";
  const sessionFresh = state.session !== null && state.sessionAt !== null && now - state.sessionAt <= SESSION_RESTORE_WINDOW_MS;
  if (!requestPending && !sessionFresh) return fromServer;

  const same = state.session && initial.session && state.session.session_id === initial.session.session_id;
  return {
    session: same ? initial.session : state.session,
    selection: state.selection,
    request: state.request,
    requested: state.requested,
    notice: state.notice,
    live: true,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** The same request again? Same answers, same exclusions, same kind of search. */
function sameSubmit(a: ActiveRequest, context: DecisionContext, previous?: PreviousRecommendations): boolean {
  const nearby = (c: DecisionContext) => c.decision_mode === "order" && c.nearby === true;
  const titles = (list?: PreviousRecommendations) => (list ?? []).map((r) => r.title).join("|");
  return contextsEqual(a.context, context) && nearby(a.context) === nearby(context) && titles(a.previous) === titles(previous);
}

/**
 * One explicit submit. `previous` is only ever passed by "Show me 3 more".
 *
 *   - Nothing running → starts a request with a fresh requestId.
 *   - The same request already running → it IS that request: nothing is sent.
 *   - A different request running (the user changed their answers) → this one
 *     becomes current and the old one is aborted; its response can never
 *     overwrite this one's.
 */
export function run(owner: string, context: DecisionContext, previous?: PreviousRecommendations): Promise<void> {
  claim(owner);
  if (active) {
    if (sameSubmit(active, context, previous)) {
      requestLog("reused", { requestId: active.requestId, why: "same_submit" });
      return active.done;
    }
    requestLog("abort", { requestId: active.requestId, reason: "superseded" });
    if (ledger?.requestId === active.requestId) ledger = { requestId: active.requestId, state: "aborted" };
    active.controller.abort();
  }
  const controller = new AbortController();
  const handle: ActiveRequest = { requestId: newRequestId(), controller, context, previous, done: Promise.resolve() };
  active = handle;
  lastRequest = { context, previous };
  handle.done = execute(owner, handle).finally(() => {
    if (active === handle) active = null;
  });
  return handle.done;
}

async function execute(owner: string, handle: ActiveRequest): Promise<void> {
  const { requestId, context, previous, controller } = handle;
  const startedAt = Date.now();
  const isCurrent = () => active === handle;
  const mode = context.decision_mode === "order" && context.nearby ? "nearby" : context.decision_mode;
  requestLog("start", { requestId, mode });
  ledger = { requestId, state: "loading" };
  const nearby = context.decision_mode === "order" && context.nearby === true;
  set({
    touched: true,
    requested: context,
    request: nearby ? { kind: "locating", requestId, startedAt } : { kind: "loading", requestId, startedAt },
  });

  try {
    // "Find food near me" is the only request that involves location, and
    // this only runs from that button's click (or "Show me 3 more" / "Try
    // again" on a nearby session) — never on load. The browser is asked every
    // time rather than remembering coordinates: they're used for this one
    // request and dropped. A fix the browser already has is returned instantly
    // (maximumAge), so there's no repeat prompt.
    let location: Awaited<ReturnType<typeof requestLocation>> | undefined;
    if (nearby) location = await requestLocation();
    if (!isCurrent()) return;

    set({ request: { kind: "loading", requestId, startedAt } });
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      body: JSON.stringify({ context, previous_recommendations: previous, location }),
      signal: controller.signal,
    });
    const body: unknown = await response.json();
    requestLog("response", { requestId, status: response.status, ms: Date.now() - startedAt, current: isCurrent() });
    if (!isCurrent()) return;
    if (response.ok && isSuccess(body)) {
      // A new decision_sessions row — chosen_index starts null on the server,
      // so selection resets here to match.
      set({
        session: {
          session_id: body.session_id,
          context,
          recommendations: body.recommendations,
          saved: body.saved,
          targets_sig: body.targets_sig,
        },
        sessionAt: Date.now(),
        selection: { status: "none" },
        request: { kind: "idle" },
        notice: null,
      });
      ledger = { requestId, state: "stored" };
      requestLog("stored", { requestId, session: body.session_id, ms: Date.now() - startedAt });
      // Nearby places are already on screen; the model's wording follows.
      if (body.enrichment_pending) void enrich(owner, body.session_id);
    } else if (isFailure(body)) {
      fail(requestId, { kind: "error", requestId, error: body.error });
    } else {
      fail(requestId, { kind: "error", requestId, error: { code: "upstream_error", message: `Unexpected response (HTTP ${response.status}).` } });
    }
  } catch (error) {
    // Aborted on purpose (superseded / owner changed): not a failure, not ours.
    if (!isCurrent()) return;
    if (error instanceof LocationError) {
      fail(requestId, { kind: "error", requestId, error: { code: error.code, message: error.message } });
      return;
    }
    fail(requestId, {
      kind: "error",
      requestId,
      error: { code: "upstream_error", message: error instanceof Error ? error.message : "Request failed." },
    });
  }
}

function fail(requestId: string, request: Extract<RequestStatus, { kind: "error" }>) {
  ledger = { requestId, state: "failed" };
  requestLog("failed", { requestId, code: request.error.code });
  set({ request });
}

/** Development trace: Home has mounted. If a request is already running or has
 *  finished in this tab, Home is attaching to IT — never starting another. Logs
 *  only; changes nothing. */
export function noteMounted(owner: string) {
  if (!ledger || snap.owner !== owner) {
    requestLog("mounted", { requestId: "none" });
    return;
  }
  requestLog("mounted", { requestId: ledger.requestId, state: ledger.state });
  if (ledger.state !== "aborted") requestLog("reused", { requestId: ledger.requestId, why: "remount" });
}

/** True while a nearby set still has rule-written reasons waiting for wording. */
export function needsEnrichment(session: ActiveSession | null): boolean {
  return !!session && session.recommendations.some((r) => r.decision_mode === "nearby" && r.enriched === false);
}

/** Asks for the model's wording on a nearby set already on screen, once per
 *  session. Any failure leaves the cards as they are — the rule-written reasons
 *  stand. Called after a nearby request, and for a restored set that was left
 *  before its wording arrived. */
export async function enrich(owner: string, sessionId: string) {
  if (enrichAsked.has(sessionId)) return;
  enrichAsked.add(sessionId);
  const mine = generation;
  try {
    const response = await fetch("/api/recommend/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    });
    if (!response.ok) return;
    const body: unknown = await response.json();
    if (mine !== generation || snap.owner !== owner || snap.session?.session_id !== sessionId) return;
    if (typeof body === "object" && body !== null && "recommendations" in body && Array.isArray(body.recommendations)) {
      set({ session: { ...snap.session, recommendations: body.recommendations as ActiveSession["recommendations"] } });
    }
  } catch {
    // Decoration, never a failure: the places and their rule-written reasons stand.
  }
}

/** Adopts a session restored from the server so enrichment / re-scoring have a
 *  home to write into — the same hand-over `choose` makes. */
export function adopt(owner: string, session: ActiveSession) {
  claim(owner);
  if (snap.session?.session_id === session.session_id) return;
  set({ touched: true, session, sessionAt: Date.now(), selection: { status: "none" } });
}

/**
 * The user's nutrition targets changed (`currentSig`) since these cards were
 * made: re-score them on the server — deterministic, no model — and swap in the
 * re-ordered set with a notice. Asked once per (session, targets) pair; nothing
 * happens for a set whose pick is already made or that has no nutrition to
 * score (the server says so). The session's recorded signature is updated
 * either way so this never repeats.
 */
export async function rescore(owner: string, session: ActiveSession, currentSig: string, options: { explicit: boolean }) {
  const key = `${session.session_id}:${currentSig}`;
  if (rescoreAsked.has(key) || session.targets_sig === currentSig) return;
  rescoreAsked.add(key);
  adopt(owner, session);
  const mine = generation;
  try {
    const result = await rescoreSession(session.session_id);
    if (mine !== generation || snap.session?.session_id !== session.session_id) return;
    if (!result.ok) return;
    const targets_sig = result.targetsSig ?? undefined;
    if (!result.rescored) {
      set({ session: { ...snap.session, targets_sig } });
      return;
    }
    set({
      session: { ...snap.session, recommendations: result.recommendations, saved: result.saved, targets_sig },
      // Said when the user just changed their details in this tab, or whenever
      // the order really moved. A quiet re-check of a restored set that already
      // fit says nothing — it would repeat on every reload.
      notice: result.changed || options.explicit ? { sessionId: session.session_id, kind: result.changed ? "updated" : "checked" } : null,
    });
  } catch {
    // A decoration on the existing cards; they stay as they were.
  }
}

export function retry(owner: string) {
  if (lastRequest) void run(owner, lastRequest.context, lastRequest.previous);
}

/** Records the pick. `session` is the one on screen — adopted into the store
 *  first if it came from the server's restore, so the choice has a home. */
export async function choose(owner: string, session: ActiveSession, index: 0 | 1 | 2) {
  claim(owner);
  if (snap.session?.session_id !== session.session_id) {
    set({ touched: true, session, sessionAt: Date.now(), selection: { status: "none" } });
  } else if (!snap.touched) {
    set({ touched: true });
  }
  if (snap.selection.status === "chosen" || choosingInFlight) return;
  choosingInFlight = true;
  const mine = generation;
  const sessionId = session.session_id;
  set({ selection: { status: "choosing", index } });
  try {
    const result = await chooseRecommendation(sessionId, index);
    // A regenerate may have replaced the session while this was in flight;
    // don't mark a since-abandoned session as chosen.
    if (mine !== generation || snap.session?.session_id !== sessionId) return;
    set({ selection: result.ok ? { status: "chosen", index: result.chosenIndex } : { status: "failed", index, message: result.error } });
  } catch (error) {
    if (mine !== generation || snap.session?.session_id !== sessionId) return;
    set({ selection: { status: "failed", index, message: error instanceof Error ? error.message : "Couldn't save your choice." } });
  } finally {
    choosingInFlight = false;
  }
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
