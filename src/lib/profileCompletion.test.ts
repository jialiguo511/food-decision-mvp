import { describe, expect, it } from "vitest";
import { profileGaps } from "./profileCompletion";

describe("optional profile gaps", () => {
  it("a brand-new person sees what would help, each with what it changes", () => {
    const gaps = profileGaps(null, 0);
    expect(gaps.map((g) => g.key)).toEqual(["allergies", "equipment", "staples"]);
    expect(gaps.every((g) => g.why.length > 0 && g.href.startsWith("#"))).toBe(true);
  });

  it("'no known allergies' counts as answered; listed equipment and staples drop out", () => {
    const row = { allergies: [], equipment: ["Stovetop"], prefs: { allergies_addressed_at: "2026-11-01T00:00:00Z", explicit_fields: ["equipment"] } };
    expect(profileGaps(row, 3).map((g) => g.key)).not.toContain("allergies");
    expect(profileGaps(row, 3).map((g) => g.key)).not.toContain("equipment");
    expect(profileGaps(row, 3).map((g) => g.key)).not.toContain("staples");
  });
});
