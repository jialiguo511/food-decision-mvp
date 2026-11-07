// "Saved new nutrition details while results are on screen" — the server side,
// against real Postgres: the cards are re-scored against the NEW targets (no
// model), re-ordered, and stored in that order so Choose and Save indexes stay
// true; a pick already made is never shuffled; and no personal targets means no
// re-scoring at all.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateNutritionTargets, targetsSignature } from "@/lib/nutrition";
import { toProfileFormValues } from "@/lib/profile";
import { createRealDb, readSql, type RealDb } from "@/test/realDb";
import { recipe } from "@/test/savedFixtures";

let real: RealDb;
let currentUser = "";
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => real.clientFor(currentUser || null),
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { rescoreSession } from "./actions";

const ME = "11111111-1111-4111-8111-111111111111";

const light = recipe({ title: "Veggie Wrap", role: "lowest_effort", estimated_calories: 350, estimated_protein_g: 15, steps: ["Roll it."] });
const balanced = recipe({ title: "Chicken Rice Bowl", role: "best_match", estimated_calories: 600, estimated_protein_g: 40, steps: ["Cook the rice."] });
const hearty = recipe({ title: "Loaded Burrito Plate", role: "alternative", estimated_calories: 950, estimated_protein_g: 55, steps: ["Fill the burrito."] });
const CONTEXT = { decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy", craving: null, ingredients_on_hand: [], budget_override_usd: 10 };

const LIFTER = { goal: "muscle_gain", sex: "male", age_years: 25, height_cm: 188, weight_kg: 95, activity_level: "very_active" };

async function setProfile(fields: Record<string, unknown>) {
  await real.admin("delete from public.profiles");
  await real.clientFor(ME).from("profiles").insert({ id: ME, prefs: { explicit_fields: ["goal"] }, ...fields });
}
async function storeSession(recs: unknown[], chosen: number | null = null) {
  const { data } = await real.clientFor(ME).from("decision_sessions").insert({ user_id: ME, context: CONTEXT, recommendations: recs, chosen_index: chosen }).select("id").single();
  return (data as { id: string }).id;
}
const storedTitles = async (id: string) => ((await real.admin<{ recommendations: { title: string }[] }>("select recommendations from public.decision_sessions where id = $1", [id]))[0].recommendations).map((r) => r.title);

beforeAll(async () => {
  real = await createRealDb({ sql: [readSql("supabase/schema.sql")] });
  await real.addUser(ME);
  currentUser = ME;
});
afterAll(() => real.db.close());
beforeEach(async () => {
  await real.admin("delete from public.decision_sessions");
});

describe("rescoreSession", () => {
  it("re-orders the cards on screen for the new targets, stores that order, and returns the new signature", async () => {
    await setProfile(LIFTER);
    const id = await storeSession([balanced, light, hearty]);
    const result = await rescoreSession(id);
    expect(result).toMatchObject({ ok: true, rescored: true, changed: true });
    if (!result.ok || !result.rescored) throw new Error("unreachable");
    expect(result.recommendations.map((r) => r.title)).toEqual(["Loaded Burrito Plate", "Chicken Rice Bowl", "Veggie Wrap"]);
    // The stored order IS the new order — indexes (Choose, Save) refer to it.
    expect(await storedTitles(id)).toEqual(["Loaded Burrito Plate", "Chicken Rice Bowl", "Veggie Wrap"]);
    const expected = targetsSignature(calculateNutritionTargets(toProfileFormValues(await real.admin("select * from public.profiles").then((r) => r[0])), 120));
    expect(result.targetsSig).toBe(expected);
    expect(result.saved).toEqual({ recipeIndexes: [], placeIds: [] });
  });

  it("a different person gets a different order from the same stored cards", async () => {
    await setProfile({ goal: "fat_loss", sex: "female", age_years: 45, height_cm: 160, weight_kg: 55, activity_level: "sedentary" });
    const id = await storeSession([balanced, light, hearty]);
    await rescoreSession(id);
    expect((await storedTitles(id))[0]).toBe("Veggie Wrap");
  });

  it("asking again with the same targets changes nothing (and says so)", async () => {
    await setProfile(LIFTER);
    const id = await storeSession([balanced, light, hearty]);
    await rescoreSession(id);
    const again = await rescoreSession(id);
    expect(again).toMatchObject({ ok: true, rescored: true, changed: false });
  });

  it("never shuffles a pick already made", async () => {
    await setProfile(LIFTER);
    const id = await storeSession([balanced, light, hearty], 0);
    expect(await rescoreSession(id)).toMatchObject({ ok: true, rescored: false });
    expect(await storedTitles(id)).toEqual(["Chicken Rice Bowl", "Veggie Wrap", "Loaded Burrito Plate"]);
  });

  it("no personal targets: nothing to score, nothing changes, no signature", async () => {
    await setProfile({});
    const id = await storeSession([balanced, light, hearty]);
    expect(await rescoreSession(id)).toEqual({ ok: true, targetsSig: null, rescored: false });
    expect(await storedTitles(id)).toEqual(["Chicken Rice Bowl", "Veggie Wrap", "Loaded Burrito Plate"]);
  });

  it("nearby places carry no nutrition estimates, so there is nothing to re-score", async () => {
    await setProfile(LIFTER);
    const nearbyContext = { decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "eat_nearby", meal_budget: "no_preference", travel_willingness: "no_preference", nearby: true };
    const { data } = await real.clientFor(ME).from("decision_sessions").insert({ user_id: ME, context: nearbyContext, recommendations: [] }).select("id").single();
    expect(await rescoreSession((data as { id: string }).id)).toMatchObject({ ok: true, rescored: false });
  });

  it("another account's session can't be re-scored", async () => {
    await setProfile(LIFTER);
    const id = await storeSession([balanced, light, hearty]);
    currentUser = "22222222-2222-4222-8222-222222222222";
    await real.addUser(currentUser);
    expect((await rescoreSession(id)).ok).toBe(false);
    currentUser = ME;
  });
});
