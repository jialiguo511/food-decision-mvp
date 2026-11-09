// Server logs are kept by the host and read by people who are not the user. A database
// error's `details` can contain the whole failing row (age, weight, allergies, a recipe
// the person typed); a rejected-output finding quotes the allergen that tripped it. Neither
// may reach a log line.

import { afterEach, describe, expect, it, vi } from "vitest";
import { logSavedFailure } from "./saved/failure";
import { writeProfile } from "./profileStore";
import { DEFAULT_FORM_VALUES } from "./profile";

afterEach(() => vi.restoreAllMocks());

const SECRET_ROW = 'Failing row contains (u1, Peanuts, 34, 82.5, "I am diabetic")';

describe("what an error log may contain", () => {
  it("a failed Profile save logs the code, not the row Postgres quotes back", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: { code: "23514", message: "violates check constraint", details: SECRET_ROW } }),
      }),
    };
    const result = await writeProfile(supabase as never, "u1", { ...DEFAULT_FORM_VALUES, allergies: ["Peanuts"] });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/Peanuts|diabetic|82\.5/);
    expect(JSON.stringify(error.mock.calls)).toContain("23514");
  });

  it("a failed save of a recipe or place logs the cause, not the row", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    logSavedFailure("save recipe", "recipe", { code: "22P02", message: "invalid input", details: SECRET_ROW, hint: null }, { userId: "12345678-aaaa" });
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/Peanuts|diabetic|82\.5/);
    expect(JSON.stringify(error.mock.calls)).toContain("22P02");
  });
});
