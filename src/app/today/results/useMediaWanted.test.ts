import { describe, expect, it } from "vitest";
import { isAdjacentSlide } from "./useMediaWanted";

describe("isAdjacentSlide — how far ahead the carousel prefetches", () => {
  it("is the active card and exactly its neighbours", () => {
    expect([0, 1, 2].map((slot) => isAdjacentSlide(0, slot))).toEqual([true, true, false]);
    expect([0, 1, 2].map((slot) => isAdjacentSlide(1, slot))).toEqual([true, true, true]);
    expect([0, 1, 2].map((slot) => isAdjacentSlide(2, slot))).toEqual([false, true, true]);
  });
  it("never applies outside a carousel or without a position", () => {
    expect(isAdjacentSlide(null, 0)).toBe(false);
    expect(isAdjacentSlide(0, undefined)).toBe(false);
  });
});
