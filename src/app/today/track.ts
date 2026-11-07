// Fire-and-forget from the browser. A failed or slow note must never slow or
// break a tap, so nothing here is awaited and nothing is surfaced.

import type { ProductEvent } from "@/lib/events/schema";
import { trackEvent } from "./events.actions";

export function track(event: ProductEvent): void {
  try {
    void trackEvent(event).catch(() => {});
  } catch {
    // never part of the loop
  }
}
