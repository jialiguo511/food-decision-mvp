// First-run setup saves through the same Profile validation and row as Me.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_VALUES } from "@/lib/profile";
import { needsOnboarding, offersNutritionStep, profileStage } from "@/lib/onboarding";
import { createFakeDb } from "@/test/fakeSupabase";

let db = createFakeDb();
let currentUser: string | null = "user-1";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.clientFor(currentUser),
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));

import { completeNutritionStep, completeOnboarding, dismissNutritionStep } from "./actions";

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
});

describe("completeOnboarding", () => {
  it("saves the answers to the profiles row and marks setup done", async () => {
    const result = await completeOnboarding({ ...DEFAULT_FORM_VALUES, goal: "fat_loss", allergies: ["peanuts"], weight_kg: 70 });
    expect(result).toEqual({ ok: true });
    const row = db.tables.profiles[0];
    expect(row).toMatchObject({ id: "user-1", goal: "fat_loss", allergies: ["Peanuts"], weight_kg: 70 });
    expect(needsOnboarding(row)).toBe(false);
  });

  it("skipping still records it, so setup is never offered again", async () => {
    await completeOnboarding({ ...DEFAULT_FORM_VALUES });
    expect(needsOnboarding(db.tables.profiles[0])).toBe(false);
  });

  it("keeps other prefs and rejects out-of-range numbers like the Profile does", async () => {
    db.seed("profiles", { id: "user-1", prefs: { other: 1 } });
    expect(await completeOnboarding({ ...DEFAULT_FORM_VALUES, age_years: 12 })).toMatchObject({ ok: false });
    await completeOnboarding({ ...DEFAULT_FORM_VALUES });
    expect(db.tables.profiles[0].prefs).toMatchObject({ other: 1, onboarding_completed_at: expect.any(String) });
  });

  it("refuses when signed out", async () => {
    currentUser = null;
    expect(await completeOnboarding({ ...DEFAULT_FORM_VALUES })).toMatchObject({ ok: false });
  });
});

describe("the optional nutrition step", () => {
  const SETUP = { onboarding_completed_at: "2026-09-30T00:00:00Z" };

  it("saving details records them and stops the step being offered; setup stays done", async () => {
    await completeOnboarding({ ...DEFAULT_FORM_VALUES, allergies: ["peanuts"] });
    expect(profileStage(db.tables.profiles[0])).toBe("partial");
    const result = await completeNutritionStep({
      ...DEFAULT_FORM_VALUES,
      allergies: ["Peanuts"],
      goal: "maintain",
      sex: "female",
      age_years: 30,
      height_cm: 165,
      weight_kg: 65,
      activity_level: "lightly_active",
    });
    expect(result).toEqual({ ok: true });
    const row = db.tables.profiles[0];
    expect(row).toMatchObject({ goal: "maintain", weight_kg: 65, allergies: ["Peanuts"] });
    expect(row.prefs).toMatchObject({ onboarding_completed_at: expect.any(String), nutrition_nudge_done_at: expect.any(String) });
    expect(profileStage(row)).toBe("complete");
  });

  it("'Not now' records only the dismissal — no profile field changes", async () => {
    db.seed("profiles", { id: "user-1", goal: "fat_loss", weight_kg: 80, allergies: ["Peanuts"], prefs: { ...SETUP } });
    expect(await dismissNutritionStep()).toEqual({ ok: true });
    const row = db.tables.profiles[0];
    expect(row).toMatchObject({ goal: "fat_loss", weight_kg: 80, allergies: ["Peanuts"] });
    expect(row.prefs).toMatchObject({ ...SETUP, nutrition_nudge_done_at: expect.any(String) });
    expect(offersNutritionStep(row)).toBe(false);
  });

  it("dismissing with no profile row writes nothing", async () => {
    expect(await dismissNutritionStep()).toEqual({ ok: true });
    expect(db.count("profiles")).toBe(0);
  });

  it("refuses when signed out", async () => {
    currentUser = null;
    expect(await dismissNutritionStep()).toMatchObject({ ok: false });
    expect(await completeNutritionStep({ ...DEFAULT_FORM_VALUES })).toMatchObject({ ok: false });
  });
});
