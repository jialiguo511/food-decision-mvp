// "What can you cook with?" — saved once, editable in Me, and it changes
// nothing else (everything else the user never set stays unset).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { toProfileFormValues, toProfileInput } from "@/lib/profile";
import { resolveRecommendationInput } from "@/lib/recommend/input";
import { cookContext } from "@/test/cookFixtures";

let db = createFakeDb();
let currentUser: string | null = "user-1";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.clientFor(currentUser),
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));

import { saveEquipment, saveProfile } from "./actions";
import { completeOnboarding } from "../today/actions";
import { DEFAULT_FORM_VALUES } from "@/lib/profile";

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
});

const hard = (row: unknown) => {
  const input = resolveRecommendationInput(toProfileInput(row), cookContext());
  return input.decision_mode === "cook" ? input.hard_constraints : null;
};

describe("saveEquipment", () => {
  it("a new user who has only done setup: unknown before, known after — and only equipment changed", async () => {
    await completeOnboarding({ ...DEFAULT_FORM_VALUES, allergies: ["Peanuts"] });
    expect(hard(db.tables.profiles[0])).toMatchObject({ equipment_known: false, equipment: [] });

    expect(await saveEquipment(["Stovetop", "Rice cooker"])).toEqual({ ok: true });
    const row = db.tables.profiles[0];
    expect(hard(row)).toMatchObject({ equipment_known: true, equipment: ["Stovetop", "Rice cooker"], no_cooking: false });
    // Nothing else was fabricated by saving it.
    expect(toProfileFormValues(row)).toMatchObject({ allergies: ["Peanuts"], budget_per_meal_usd: null, default_cook_minutes: null, goal: null });
    expect((row.prefs as Record<string, unknown>).explicit_fields).toEqual(["equipment"]);
    // And setup stays recorded.
    expect((row.prefs as Record<string, unknown>).onboarding_completed_at).toEqual(expect.any(String));
  });

  it("works for a user with no profile row yet", async () => {
    expect(await saveEquipment(["Microwave"])).toEqual({ ok: true });
    expect(toProfileFormValues(db.tables.profiles[0]).equipment).toEqual(["Microwave"]);
  });

  it("a user who says they have no microwave gets recipes that can't need one", async () => {
    await saveEquipment(["Stovetop", "Oven"]);
    const constraints = hard(db.tables.profiles[0]);
    expect(constraints?.equipment).not.toContain("Microwave");
    expect(JSON.stringify(constraints)).not.toMatch(/microwave/i);
  });

  it("'No cooking at all' is a real answer", async () => {
    await saveEquipment(["No cooking at all"]);
    expect(hard(db.tables.profiles[0])).toMatchObject({ equipment_known: true, no_cooking: true });
  });

  it("an empty pick is rejected — it is not 'no appliances'; unknown items are dropped", async () => {
    expect(await saveEquipment([])).toEqual({ ok: false, error: "Pick at least one." });
    expect(await saveEquipment(["Time machine"])).toEqual({ ok: false, error: "Pick at least one." });
    expect(db.count("profiles")).toBe(0);
    await saveEquipment(["Oven", "Time machine"]);
    expect(toProfileFormValues(db.tables.profiles[0]).equipment).toEqual(["Oven"]);
  });

  it("is editable in Me: the form can change it and clear it back to unknown", async () => {
    await saveEquipment(["Oven"]);
    await saveProfile({ ...toProfileFormValues(db.tables.profiles[0]), equipment: ["Oven", "Air fryer"] });
    expect(toProfileFormValues(db.tables.profiles[0]).equipment).toEqual(["Oven", "Air fryer"]);
    await saveProfile({ ...toProfileFormValues(db.tables.profiles[0]), equipment: null });
    expect(toProfileFormValues(db.tables.profiles[0]).equipment).toBeNull();
  });

  it("refuses when signed out", async () => {
    currentUser = null;
    expect(await saveEquipment(["Oven"])).toMatchObject({ ok: false });
  });
});

describe("dietary pattern is stored with the Profile and reaches the recommender", () => {
  it("round-trips through the prefs JSON — no schema column", async () => {
    await saveProfile({ ...DEFAULT_FORM_VALUES, dietary_patterns: ["vegetarian", "halal"], dietary_other: "  no   red meat " });
    const row = db.tables.profiles[0];
    expect(row).not.toHaveProperty("dietary_patterns");
    expect((row.prefs as Record<string, unknown>).dietary).toEqual({ patterns: ["vegetarian", "halal"], other: "no red meat" });
    expect(toProfileFormValues(row)).toMatchObject({ dietary_patterns: ["vegetarian", "halal"], dietary_other: "no red meat" });
    expect(hard(row)).toMatchObject({ dietary: { patterns: ["vegetarian", "halal"], other: "no red meat" } });
  });

  it("'No preference' (cleared) removes it; unknown values are dropped", async () => {
    await saveProfile({ ...DEFAULT_FORM_VALUES, dietary_patterns: ["vegan"] });
    await saveProfile({ ...toProfileFormValues(db.tables.profiles[0]), dietary_patterns: [], dietary_other: null });
    expect(toProfileFormValues(db.tables.profiles[0]).dietary_patterns).toEqual([]);
    const row = { id: "u", prefs: { dietary: { patterns: ["vegan", "carnivore"], other: 5 } } };
    expect(toProfileFormValues(row)).toMatchObject({ dietary_patterns: ["vegan"], dietary_other: null });
  });

  it("saving something else (equipment, nutrition step) never wipes it", async () => {
    await saveProfile({ ...DEFAULT_FORM_VALUES, dietary_patterns: ["kosher"] });
    await saveEquipment(["Oven"]);
    expect(toProfileFormValues(db.tables.profiles[0]).dietary_patterns).toEqual(["kosher"]);
  });
});
