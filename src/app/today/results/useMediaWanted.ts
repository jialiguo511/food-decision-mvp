"use client";

import { createContext, useContext, type RefObject } from "react";
import { useNearViewport } from "@/components/useNearViewport";

/** The carousel's active card index; null outside a carousel (e.g. Saved). */
export const ActiveSlideContext = createContext<number | null>(null);

/** A card is "next to" the active one when it is the active card or its
 *  immediate neighbour. */
export function isAdjacentSlide(active: number | null, slot: number | undefined): boolean {
  return active !== null && slot !== undefined && Math.abs(slot - active) <= 1;
}

/**
 * Should this card's picture be fetched yet? Yes once it is about to be seen —
 * and, inside the carousel, as soon as it is the active card or the one right
 * next to it.
 *
 * Why not the viewport alone: a horizontal scroller clips its children, and the
 * viewport observer's margin cannot see past that clip. So the second card was
 * only fetched because a sliver of it happened to peek in, and the third only
 * after the user had already swiped to it — then waited out a whole generation
 * (tens of seconds) behind a placeholder. Looking exactly one card ahead hides
 * that wait, and still never pays for a card two swipes away.
 */
export function useMediaWanted(ref: RefObject<Element | null>, slot?: number): boolean {
  const near = useNearViewport(ref);
  const active = useContext(ActiveSlideContext);
  return near || isAdjacentSlide(active, slot);
}
