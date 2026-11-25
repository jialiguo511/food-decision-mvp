import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { APP_ACTIONS, argsAreValid } from "./actions";

describe("app write allowlist", () => {
  it("lists exactly the Server Actions the client modules call", () => {
    expect(Object.keys(APP_ACTIONS).sort()).toEqual(
      [
        "chooseRecommendation", "clearPlaceFeedback", "completeNutritionStep", "completeOnboarding", "confirmNoAllergies",
        "deleteAccount", "dismissNutritionStep", "recordMealFeedback", "recordPlaceFeedback", "removeSaved", "rescoreSession",
        "resetMyData", "saveEquipment", "saveFromSession", "saveProfile", "setKitchenStaples", "setMealFeedbackNote",
        "submitFeedback", "trackEvent", "unsaveFromSession",
      ].sort(),
    );
    // Not a way into the object's prototype.
    expect(Object.prototype.hasOwnProperty.call(APP_ACTIONS, "constructor")).toBe(false);
  });

  it("checks argument shapes before anything runs", () => {
    expect(argsAreValid(APP_ACTIONS.chooseRecommendation, ["s1", 1])).toBe(true);
    expect(argsAreValid(APP_ACTIONS.chooseRecommendation, ["s1"])).toBe(false);
    expect(argsAreValid(APP_ACTIONS.chooseRecommendation, ["s1", "1"])).toBe(false);
    expect(argsAreValid(APP_ACTIONS.chooseRecommendation, ["s1", 1, "extra"])).toBe(false);
    expect(argsAreValid(APP_ACTIONS.removeSaved, ["recipe", "id"])).toBe(true);
    expect(argsAreValid(APP_ACTIONS.removeSaved, ["profile", "id"])).toBe(false);
    expect(argsAreValid(APP_ACTIONS.deleteAccount, [])).toBe(true);
    expect(argsAreValid(APP_ACTIONS.deleteAccount, [{ appleAuthorizationCode: "x" }])).toBe(true);
    expect(argsAreValid(APP_ACTIONS.setKitchenStaples, [["Salt", 3]])).toBe(false);
    expect(argsAreValid(APP_ACTIONS.resetMyData, ["anything"])).toBe(false);
    expect(argsAreValid(APP_ACTIONS.saveProfile, "not an array")).toBe(false);
  });
});
