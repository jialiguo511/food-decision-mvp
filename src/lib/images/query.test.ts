import { describe, expect, it } from "vitest";
import { normalizeImageQuery } from "./query";

describe("normalizeImageQuery", () => {
  it("lowercases, trims, and collapses repeated whitespace", () => {
    expect(normalizeImageQuery("  Chicken   Spinach  Rice Bowl  ")).toBe("chicken spinach rice bowl");
  });

  it("leaves an already-normalized query unchanged", () => {
    expect(normalizeImageQuery("tofu egg spinach scramble")).toBe("tofu egg spinach scramble");
  });
});
