// Travel willingness → what actually gets searched. Eat nearby and Pickup both
// involve going somewhere, so both ask the question; delivery doesn't, so any
// stored value is ignored for it.

import type { OrderContext, OrderMethod, TravelWillingness } from "../types";
import { TRAVEL_SEARCH } from "./config";

/** Whether "How far would you go?" applies to this method. The one place that
 *  decides it — the form, remembered defaults, and search all defer here. */
export function asksTravel(method: OrderMethod): boolean {
  return method === "eat_nearby" || method === "pickup";
}

export function effectiveTravel(context: Pick<OrderContext, "method" | "travel_willingness">): TravelWillingness {
  return asksTravel(context.method) ? context.travel_willingness : "no_preference";
}

export function searchRadiusMeters(context: Pick<OrderContext, "method" | "travel_willingness">): number {
  return TRAVEL_SEARCH[effectiveTravel(context)].radius_m;
}
