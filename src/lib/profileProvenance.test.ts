// A system fallback is never presented as something the user told us — see
// lib/profileProvenance.ts. These are the tests for the new-user path: nothing
// in a fresh profile is set, nothing is written as if it were chosen, and what
// the recommender assumes without being told is "nothing".

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { cookContext } from "@/test/cookFixtures";
import { DEFAULT_FORM_VALUES, toProfileFormValues, toProfileInput, validateProfileForm } from "./profile";
import { explicitFields } from "./profileProvenance";
import { writeProfile } from "./profileStore";
import { buildSystemPrompt } from "./recommend/prompt";
import { resolveRecommendationInput } from "./recommend/input";
import { baseDefaults } from "./recommend/rememberedDefaults";
import { SYSTEM_FALLBACKS } from "./options";

const client = (db: ReturnType<typeof createFakeDb>, user = "u1") => db.clientFor(user) as unknown as SupabaseClient;

/** A row exactly as Postgres leaves it after an insert that named only the id:
 *  the NOT NULL defaults filled in by the database, nothing chosen by anyone. */
const UNTOUCHED_DB_ROW = {
  id: "u1",
  goal: "general_health",
  protein_target_g: null,
  budget_per_meal_usd: "12.00",
  fridge_size: "standard",
  default_cook_minutes: 30,
  cuisines: [],
  dislikes: [],
  equipment: [],
  allergies: [],
  prefs: {},
};

describe("a truly new user has nothing set", () => {
  it("no row: every provenance-managed field is null — not $12, not 30 min, not a microwave", () => {
    const form = toProfileFormValues(null);
    expect(form).toEqual(DEFAULT_FORM_VALUES);
    expect(form).toMatchObject({ goal: null, budget_per_meal_usd: null, default_cook_minutes: null, fridge_size: null, equipment: null });
  });

  it("a row the database filled with its own defaults reads as not set too", () => {
    const form = toProfileFormValues(UNTOUCHED_DB_ROW);
    expect(form.budget_per_meal_usd).toBeNull();
    expect(form.default_cook_minutes).toBeNull();
    expect(form.fridge_size).toBeNull();
    expect(form.equipment).toBeNull();
    expect(form.goal).toBeNull();
    expect(explicitFields(UNTOUCHED_DB_ROW).size).toBe(0);
  });

  it("the old fake default equipment (Stovetop + Microwave) on a legacy row is not believed", () => {
    expect(toProfileFormValues({ ...UNTOUCHED_DB_ROW, equipment: ["Stovetop", "Microwave"] }).equipment).toBeNull();
    // ...but any other set can only have been chosen.
    expect(toProfileFormValues({ ...UNTOUCHED_DB_ROW, equipment: ["Stovetop", "Oven"] }).equipment).toEqual(["Stovetop", "Oven"]);
  });

  it("first-run setup (allergies only) saves nothing the user didn't set — and a read-back is still unset", async () => {
    const db = createFakeDb();
    const result = await writeProfile(client(db), "u1", { ...toProfileFormValues(null), allergies: ["Peanuts"] }, { onboarding_completed_at: "now" });
    expect(result).toEqual({ ok: true });
    const row = db.tables.profiles[0];
    // Not even written: the database default fills the NOT NULL columns on its own.
    for (const column of ["budget_per_meal_usd", "default_cook_minutes", "fridge_size", "equipment", "goal"]) {
      expect(row).not.toHaveProperty(column);
    }
    expect((row.prefs as Record<string, unknown>).explicit_fields).toEqual([]);

    // Even if the database then fills its defaults in, they read back as unset.
    const afterDefaults = { ...UNTOUCHED_DB_ROW, ...row, budget_per_meal_usd: 12, default_cook_minutes: 30, equipment: [] };
    expect(toProfileFormValues(afterDefaults)).toMatchObject({ budget_per_meal_usd: null, default_cook_minutes: null, equipment: null, allergies: ["Peanuts"] });
  });

  it("the Cook form starts unanswered — no $12, no 30 min preselected", () => {
    const { cook, budgetUsual } = baseDefaults();
    expect(cook).toMatchObject({ cook_minutes: null, effort: null, shopping: null, budget_override_usd: null });
    expect(budgetUsual).toBeNull();
  });
});

describe("a value counts as the user's only if they set it", () => {
  it("setting a budget and time stores them as explicit — even a value equal to the old default", async () => {
    const db = createFakeDb();
    await writeProfile(client(db), "u1", { ...DEFAULT_FORM_VALUES, budget_per_meal_usd: 12, default_cook_minutes: 30 });
    const row = db.tables.profiles[0];
    expect(row).toMatchObject({ budget_per_meal_usd: 12, default_cook_minutes: 30 });
    expect(toProfileFormValues(row)).toMatchObject({ budget_per_meal_usd: 12, default_cook_minutes: 30 });
  });

  it("clearing one returns the app to no persistent default, even though the column keeps its stale value", async () => {
    const db = createFakeDb();
    await writeProfile(client(db), "u1", { ...DEFAULT_FORM_VALUES, budget_per_meal_usd: 20, default_cook_minutes: 45 });
    await writeProfile(client(db), "u1", { ...toProfileFormValues(db.tables.profiles[0]), budget_per_meal_usd: null });
    const row = db.tables.profiles[0];
    expect(row.budget_per_meal_usd).toBe(20); // untouched column, ignored
    expect(toProfileFormValues(row)).toMatchObject({ budget_per_meal_usd: null, default_cook_minutes: 45 });
  });

  it("a saved Profile keeps other prefs keys", async () => {
    const db = createFakeDb();
    db.seed("profiles", { id: "u1", prefs: { other: 1, onboarding_completed_at: "t" } });
    await writeProfile(client(db), "u1", { ...DEFAULT_FORM_VALUES, equipment: ["Oven"] });
    expect(db.tables.profiles[0].prefs).toMatchObject({ other: 1, onboarding_completed_at: "t", explicit_fields: ["equipment"] });
  });

  it("an empty equipment list is 'not answered', never 'no appliances'", () => {
    const validated = validateProfileForm({ ...DEFAULT_FORM_VALUES, equipment: [] });
    expect(validated.ok && validated.prefs.explicit_fields).toEqual([]);
    expect(validated.ok && validated.row).not.toHaveProperty("equipment");
  });
});

describe("the recommender never assumes what the user hasn't said", () => {
  const cookInput = (row: unknown) => resolveRecommendationInput(toProfileInput(row), cookContext({ budget_override_usd: null }));

  it("unknown equipment: no appliance at all — never a microwave", () => {
    const input = cookInput(UNTOUCHED_DB_ROW);
    expect(input.decision_mode === "cook" && input.hard_constraints).toMatchObject({ equipment: [], equipment_known: false, no_cooking: true });
    expect(JSON.stringify(input)).not.toMatch(/microwave/i);
    expect(buildSystemPrompt(input)).toMatch(/equipment_known/);
  });

  it("an owned set is passed through, and anything not in it is not", () => {
    const row = { ...UNTOUCHED_DB_ROW, equipment: ["Stovetop", "Rice cooker"], prefs: { explicit_fields: ["equipment"] } };
    const input = cookInput(row);
    expect(input.decision_mode === "cook" && input.hard_constraints).toMatchObject({ equipment: ["Stovetop", "Rice cooker"], equipment_known: true, no_cooking: false });
    expect(JSON.stringify(input)).not.toMatch(/microwave|oven/i);
  });

  it("'No cooking at all' means no appliance, and is a known answer", () => {
    const row = { ...UNTOUCHED_DB_ROW, equipment: ["No cooking at all"], prefs: { explicit_fields: ["equipment"] } };
    expect(cookInput(row).decision_mode === "cook" && cookInput(row).hard_constraints).toMatchObject({ equipment: [], equipment_known: true, no_cooking: true });
  });

  it("with no budget from anywhere, the ceiling is the internal fallback, labelled 'default' — not the profile's", () => {
    const hc = cookInput(UNTOUCHED_DB_ROW);
    expect(hc.decision_mode === "cook" && hc.hard_constraints).toMatchObject({ budget_usd: SYSTEM_FALLBACKS.extras_budget_usd, budget_source: "default" });
  });

  it("a budget the user set, or chose tonight, outranks the fallback", () => {
    const profile = { ...UNTOUCHED_DB_ROW, budget_per_meal_usd: 20, prefs: { explicit_fields: ["budget_per_meal_usd"] } };
    expect(cookInput(profile).decision_mode === "cook" && cookInput(profile).hard_constraints).toMatchObject({ budget_usd: 20, budget_source: "profile" });
    const tonight = resolveRecommendationInput(toProfileInput(profile), cookContext({ budget_override_usd: 7 }));
    expect(tonight.decision_mode === "cook" && tonight.hard_constraints).toMatchObject({ budget_usd: 7, budget_source: "override" });
  });

  it("'Use what I have' stays strict: budget 0, no shopping", () => {
    const input = resolveRecommendationInput(toProfileInput(null), cookContext({ shopping: "inventory_only", budget_override_usd: null }), undefined, ["Salt"]);
    expect(input.decision_mode === "cook" && input.hard_constraints).toMatchObject({ budget_usd: 0, no_shopping: true });
  });
});
