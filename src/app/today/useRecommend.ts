"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ActiveSession, DecisionContext } from "@/lib/types";
import {
  adopt,
  choose,
  enrich,
  getServerSnapshot,
  getSnapshot,
  needsEnrichment,
  noteMounted,
  rescore,
  retry,
  run,
  subscribe,
  viewOf,
  type RecommendView,
} from "./recommendStore";

export type { RequestStatus, Selection } from "./recommendStore";

/**
 * Home's window onto the recommendation request. The state itself lives in
 * recommendStore.ts, outside React, so it survives leaving Home and coming
 * back — see the rule there. `initial` is what the server restored for this
 * visit (≤ 6 h old); this tab's own state wins over it when it has any.
 *
 * `run` and `choose` must be called from event handlers, never from an effect:
 * a remount is not intent, so only a tap may create a (paid) request.
 */
export function useRecommend(owner: string, initial: { session: ActiveSession | null; chosenIndex: 0 | 1 | 2 | null }) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Derived fresh each render from (store, server restore); both are stable
  // between changes, so this is cheap and has no state of its own.
  const view: RecommendView = viewOf(snap, owner, initial);

  // Development trace only: says whether this Home attached to a request that
  // already exists. It reads the store and logs; it never starts anything.
  useEffect(() => noteMounted(owner), [owner]);

  const runFor = useCallback(
    (context: DecisionContext, previous?: ActiveSession["recommendations"]) => run(owner, context, previous),
    [owner],
  );
  const chooseFor = useCallback(
    (index: 0 | 1 | 2) => {
      if (view.session) void choose(owner, view.session, index);
    },
    [owner, view.session],
  );
  const retryFor = useCallback(() => retry(owner), [owner]);
  /** Nearby places restored without their wording: ask for it once. */
  const ensureEnriched = useCallback(
    (session: ActiveSession) => {
      if (!needsEnrichment(session)) return;
      adopt(owner, session);
      void enrich(owner, session.session_id);
    },
    [owner],
  );
  const rescoreFor = useCallback(
    (session: ActiveSession, sig: string, explicit: boolean) => void rescore(owner, session, sig, { explicit }),
    [owner],
  );

  return { ...view, run: runFor, retry: retryFor, choose: chooseFor, ensureEnriched, rescore: rescoreFor };
}
