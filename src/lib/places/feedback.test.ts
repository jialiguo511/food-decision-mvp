import { describe, expect, it } from "vitest";
import { PLACE_FEEDBACK_REASONS } from "../options";
import { actionForReason, isPlaceFeedbackReason, PLACE_PROVIDER, toPlaceFeedbackSets } from "./feedback";

describe("actionForReason", () => {
  it("hard reasons exclude; soft reasons only downrank", () => {
    expect(actionForReason("closed")).toBe("exclude");
    expect(actionForReason("dont_like")).toBe("exclude");
    expect(actionForReason("bad_experience")).toBe("exclude");
    expect(actionForReason("too_expensive")).toBe("downrank");
    // An unexplained tap never permanently removes a place.
    expect(actionForReason("other")).toBe("downrank");
  });

  it("every reason offered in the UI has an action, and nothing else is accepted", () => {
    for (const { value } of PLACE_FEEDBACK_REASONS) {
      expect(isPlaceFeedbackReason(value)).toBe(true);
      expect(["exclude", "downrank"]).toContain(actionForReason(value));
    }
    for (const bad of ["unsanitary", "", "toString", "__proto__", 3, null, undefined]) {
      expect(isPlaceFeedbackReason(bad)).toBe(false);
    }
  });

  it("offers fixed reasons only — no free text to store as if it were a fact about a business", () => {
    expect(PLACE_FEEDBACK_REASONS.map((r) => r.label)).toEqual([
      "Closed",
      "Don't like this place",
      "Too expensive",
      "Bad experience",
      "Other",
    ]);
  });
});

describe("toPlaceFeedbackSets", () => {
  it("splits rows by the provider's place id", () => {
    const sets = toPlaceFeedbackSets([
      { place_id: "ChIJ-1", action: "exclude" },
      { place_id: "ChIJ-2", action: "downrank" },
    ]);
    expect([...sets.excluded]).toEqual(["ChIJ-1"]);
    expect([...sets.downranked]).toEqual(["ChIJ-2"]);
    expect(PLACE_PROVIDER).toBe("google_places");
  });

  it("skips unreadable rows; exclusion wins if a place is somehow in both", () => {
    const sets = toPlaceFeedbackSets([
      { place_id: 5, action: "exclude" },
      { place_id: "", action: "exclude" },
      { place_id: "x", action: "weird" },
      { place_id: "both", action: "downrank" },
      { place_id: "both", action: "exclude" },
    ]);
    expect([...sets.excluded]).toEqual(["both"]);
    expect(sets.downranked.size).toBe(0);
  });

  it("no rows (a fresh user) means no effect", () => {
    const sets = toPlaceFeedbackSets([]);
    expect(sets.excluded.size + sets.downranked.size).toBe(0);
  });
});
