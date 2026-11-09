import { describe, expect, it } from "vitest";
import { allergyStatus } from "./allergyStatus";

describe("allergyStatus", () => {
  it("no row, or garbage, is not set", () => {
    for (const row of [null, undefined, "x", 3, [], {}]) expect(allergyStatus(row)).toBe("not_set");
  });
  it("an empty list with nothing addressed is NOT 'none' — we were never told", () => {
    expect(allergyStatus({ allergies: [], prefs: {} })).toBe("not_set");
    expect(allergyStatus({ allergies: [], prefs: { dietary: { patterns: [] } } })).toBe("not_set");
  });
  it("a list is a list, whatever prefs say", () => {
    expect(allergyStatus({ allergies: ["Peanuts"], prefs: {} })).toBe("listed");
    expect(allergyStatus({ allergies: ["  "], prefs: {} })).toBe("not_set");
  });
  it("addressed with nothing listed means none known", () => {
    expect(allergyStatus({ allergies: [], prefs: { allergies_addressed_at: "2026-11-08T00:00:00Z" } })).toBe("none_known");
  });
});
