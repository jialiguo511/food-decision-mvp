// Travel willingness → what actually gets searched. Only Eat nearby asks the
// question, so for delivery and pickup any stored value is ignored.

import type { OrderContext, TravelWillingness } from "../types";
import { TRAVEL_SEARCH } from "./config";

export function effectiveTravel(context: Pick<OrderContext, "method" | "travel_willingness">): TravelWillingness {
  return context.method === "eat_nearby" ? context.travel_willingness : "no_preference";
}

export function searchRadiusMeters(context: Pick<OrderContext, "method" | "travel_willingness">): number {
  return TRAVEL_SEARCH[effectiveTravel(context)].radius_m;
}
