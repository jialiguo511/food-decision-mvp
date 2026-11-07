// Client-side memory for recipe pictures, outside React (same idea as
// recommendStore.ts). A card's picture request must not depend on whether the
// card's component happens to be mounted: leaving Home and coming back, a
// dev-mode double mount, or a card remounting must not start a second request —
// the server's generation is paid, and only a finished image is cached there.
//
// What this guarantees, per card (session:index, or saved:id):
//   * at most one request in flight — concurrent callers share it;
//   * a settled answer (picture, or "nothing to show") is remembered for the
//     page's lifetime, so remounting shows it with no request at all;
//   * a failure is NOT remembered as an answer — "Try again" really asks again —
//     but only a few times, so a broken card can't loop paid attempts.

import type { RecipeImageResult } from "@/lib/images";

export type RecipeImageTarget =
  /** A card of one of the user's recommendation sessions. */
  | { session_id: string; index: number }
  /** A row of the user's Saved recipes. */
  | { saved_id: string };

/** What a card's picture settled as. The three are told apart on purpose:
 *  "none" is a real answer (don't ask again); "failed" is worth a retry, and
 *  says whether the request or the generation failed. A picture that arrives
 *  but then won't display is the component's own state (onError), not here. */
export type ImageOutcome =
  | { status: "ready"; result: RecipeImageResult }
  | { status: "none"; reason: "no_image" | "limited" }
  | { status: "failed"; cause: "request" | "generation" };

/** Failed attempts after which a card stops offering retries. */
export const MAX_ATTEMPTS = 3;
/** Longer than the route's maxDuration, so a hung request ends here, not never. */
const REQUEST_TIMEOUT_MS = 70_000;

export const imageKey = (target: RecipeImageTarget): string => ("saved_id" in target ? `saved:${target.saved_id}` : `${target.session_id}:${target.index}`);

const settled = new Map<string, ImageOutcome>();
const inFlight = new Map<string, Promise<ImageOutcome>>();
const failures = new Map<string, number>();

/** The remembered answer for a card, if there is one — no network. */
export function peekImage(key: string): ImageOutcome | undefined {
  return settled.get(key);
}

export function requestImage(target: RecipeImageTarget): Promise<ImageOutcome> {
  const key = imageKey(target);
  const known = settled.get(key);
  if (known) return Promise.resolve(known);
  const running = inFlight.get(key);
  if (running) return running;
  if ((failures.get(key) ?? 0) >= MAX_ATTEMPTS) return Promise.resolve({ status: "none", reason: "no_image" });

  const request = fetchOutcome(target)
    .then((outcome) => {
      if (outcome.status === "failed") failures.set(key, (failures.get(key) ?? 0) + 1);
      else settled.set(key, outcome);
      return outcome;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** The picture arrived but the browser could not display it, so the remembered
 *  answer is worth nothing: forget it, and count it against the retry budget. */
export function forgetImage(key: string): void {
  settled.delete(key);
  failures.set(key, (failures.get(key) ?? 0) + 1);
}

/** How many more tries this card offers. For the UI: no button once it's 0. */
export function retriesLeft(key: string): number {
  return Math.max(0, MAX_ATTEMPTS - (failures.get(key) ?? 0));
}

async function fetchOutcome(target: RecipeImageTarget): Promise<ImageOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
    });
  } catch {
    console.warn("[image] request did not complete", { cause: "network_or_timeout" });
    return { status: "failed", cause: "request" };
  }
  // Out of picture budget: a settled answer, not something to retry in a loop.
  if (response.status === 429) return { status: "none", reason: "limited" };
  if (!response.ok) {
    console.warn("[image] request failed", { status: response.status });
    return { status: "failed", cause: "request" };
  }
  const data = (await response.json().catch(() => null)) as ({ url: string | null } & Record<string, unknown>) | null;
  const result = toResult(data);
  if (result) return { status: "ready", result };
  if (data?.reason === "generation_failed") {
    console.warn("[image] the server could not generate a picture");
    return { status: "failed", cause: "generation" };
  }
  return { status: "none", reason: "no_image" };
}

/** The route's response → a result, or null for "no image" in any form. */
export function toResult(data: ({ url: string | null } & Record<string, unknown>) | null): RecipeImageResult | null {
  if (!data?.url || typeof data.url !== "string") return null;
  if (data.source === "generated") return { source: "generated", url: data.url };
  if (typeof data.photographerName === "string" && typeof data.photographerUrl === "string" && typeof data.sourceUrl === "string") {
    return { source: "photo", url: data.url, photographerName: data.photographerName, photographerUrl: data.photographerUrl, sourceUrl: data.sourceUrl };
  }
  return null;
}

/** Tests only. */
export function resetImageStore(): void {
  settled.clear();
  inFlight.clear();
  failures.clear();
}
