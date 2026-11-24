import { describe, expect, it } from "vitest";
import { storeSnackContextSchema } from "./input";

describe("snack context with several cravings", () => {
  it("accepts compatible extra cravings and old single-craving sessions", () => {
    expect(storeSnackContextSchema.safeParse({ decision_mode: "store_snack", hunger: "normal", craving_type: "sweet", also_craving: ["crunchy"] }).success).toBe(true);
    expect(storeSnackContextSchema.safeParse({ decision_mode: "store_snack", hunger: "normal", craving_type: "salty" }).success).toBe(true);
  });

  it("refuses 'anything' as an extra, and more than three", () => {
    expect(storeSnackContextSchema.safeParse({ decision_mode: "store_snack", hunger: "normal", craving_type: "sweet", also_craving: ["anything"] }).success).toBe(false);
    expect(
      storeSnackContextSchema.safeParse({ decision_mode: "store_snack", hunger: "normal", craving_type: "sweet", also_craving: ["salty", "crunchy", "creamy", "sweet"] }).success,
    ).toBe(false);
  });
});
