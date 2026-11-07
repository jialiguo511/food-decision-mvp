// Reset my data / Delete my account — through the real server actions over the
// in-memory database. "Reset equals new account" is checked by deriving the
// product's first-time state from the rows with the SAME functions the pages use
// and comparing a reset account against one that never existed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_TABLES } from "@/lib/accountData";
import { needsOnboarding, offersNutritionStep, profileStage } from "@/lib/onboarding";
import { toProfileFormValues } from "@/lib/profile";
import { rememberedDefaults } from "@/lib/recommend/rememberedDefaults";
import { isRecentSession, parseStoredSession } from "@/lib/recommend/session";
import { loadSavedState } from "@/lib/saved/savedQuery";
import { createFakeDb } from "@/test/fakeSupabase";
import { cookContext } from "@/test/cookFixtures";
import { recipe } from "@/test/savedFixtures";
import { saveFromSession } from "../saved/actions";
import { completeOnboarding } from "../today/actions";
import { saveEquipment, saveProfile } from "./actions";
import { DEFAULT_FORM_VALUES } from "@/lib/profile";
import type { SupabaseClient } from "@supabase/supabase-js";

let db = createFakeDb();
let currentUser: string | null = "u1";
const signOut = vi.fn(async () => ({ error: null }));
const deleteUser = vi.fn<(id: string) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null }));
let adminConfigured = true;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const c = db.clientFor(currentUser);
    return { ...c, auth: { ...c.auth, signOut } };
  },
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    if (!adminConfigured) return null;
    const c = db.clientFor("service-role");
    return { ...c, auth: { ...c.auth, admin: { deleteUser } } };
  },
}));

import { deleteAccount, resetMyData } from "./account.actions";

/** A user who has used everything: setup, profile, sessions, picks, feedback, saves, staples. */
async function useTheApp(user = "u1") {
  currentUser = user;
  await completeOnboarding({ ...DEFAULT_FORM_VALUES, allergies: ["Peanuts"], dietary_patterns: ["vegetarian"] });
  await saveEquipment(["Stovetop", "Oven"]);
  await saveProfile({ ...toProfileFormValues(db.tables.profiles.find((r) => r.id === user)), budget_per_meal_usd: 20, default_cook_minutes: 20 });
  db.seed("kitchen_staples", { user_id: user, name: "Salt" });
  db.seed("kitchen_staples", { user_id: user, name: "Soy sauce" });
  db.seed("decision_sessions", { id: `s-${user}`, user_id: user, context: cookContext({ cook_minutes: 45 }), recommendations: [recipe()] });
  db.tables.decision_sessions.find((r) => r.id === `s-${user}`)!.chosen_index = 0; // "Choose this"
  db.seed("meal_feedback", { user_id: user, session_id: `s-${user}`, did_eat: true }); // "did you eat it"
  await saveFromSession(`s-${user}`, 0);
  db.seed("place_feedback", { user_id: user, provider: "google_places", place_id: "p1", action: "exclude", reason: "closed" });
  db.seed("saved_places", { user_id: user, provider: "google_places", place_id: "p2", name: "P" });
  db.seed("recipes", { user_id: user, raw: "x" });
  db.seed("pantry_items", { user_id: user, name: "Chicken" });
}

const rowsFor = (user: string) =>
  USER_TABLES.flatMap(({ table, column }) => (db.tables[table] ?? []).filter((r) => r[column] === user).map(() => table));

/** The first-time-relevant product state, derived exactly as Home and Me derive it. */
async function productStateOf(user: string) {
  const supabase = db.clientFor(user) as unknown as SupabaseClient;
  const profileRow = (db.tables.profiles ?? []).find((r) => r.id === user) ?? null;
  const sessions = (db.tables.decision_sessions ?? []).filter((r) => r.user_id === user);
  const restorable = sessions.filter((r) => isRecentSession(r.created_at)).map(parseStoredSession).filter(Boolean);
  return {
    stage: profileStage(profileRow),
    needsOnboarding: needsOnboarding(profileRow),
    offersNutritionStep: offersNutritionStep(profileRow),
    profile: toProfileFormValues(profileRow),
    defaults: rememberedDefaults(sessions.map((r) => r.context)),
    restoredSessions: restorable.length,
    staples: (db.tables.kitchen_staples ?? []).filter((r) => r.user_id === user).length,
    savedState: await loadSavedState(supabase, user, [recipe()]),
  };
}

beforeEach(() => {
  db = createFakeDb();
  currentUser = "u1";
  adminConfigured = true;
  signOut.mockClear();
  deleteUser.mockClear();
  deleteUser.mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("Reset my data", () => {
  it("removes every row the user owns, in every table — and nobody else's", async () => {
    await useTheApp("u1");
    await useTheApp("u2");
    expect(rowsFor("u1").length).toBeGreaterThanOrEqual(USER_TABLES.length); // setup really did touch everything
    expect(new Set(rowsFor("u1"))).toEqual(new Set(USER_TABLES.map((t) => t.table)));

    currentUser = "u1";
    expect(await resetMyData()).toEqual({ ok: true });
    expect(rowsFor("u1")).toEqual([]);
    expect(new Set(rowsFor("u2"))).toEqual(new Set(USER_TABLES.map((t) => t.table))); // untouched
  });

  it("keeps the login: no auth deletion, no sign-out", async () => {
    await useTheApp();
    await resetMyData();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("works without any admin key — it only ever uses the user's own client", async () => {
    await useTheApp();
    adminConfigured = false;
    expect(await resetMyData()).toEqual({ ok: true });
  });

  it("returns the account to the new-user stage and makes setup and the nutrition step eligible again", async () => {
    await useTheApp();
    expect(profileStage(db.tables.profiles[0])).not.toBe("new");
    await resetMyData();
    const s = await productStateOf("u1");
    expect(s.stage).toBe("new");
    expect(s.needsOnboarding).toBe(true); // onboarding runs again
    expect(db.tables.profiles).toEqual([]);
  });

  it("forgets every remembered setting and 'Last time'", async () => {
    await useTheApp();
    expect((await productStateOf("u1")).defaults.remembered.cook).toBe(true);
    await resetMyData();
    const { defaults } = await productStateOf("u1");
    expect(defaults.remembered).toEqual({ cook: false, order: false, store_snack: false });
    expect(defaults.budgetUsual).toBeNull();
    expect(defaults.cook).toMatchObject({ cook_minutes: null, effort: null, shopping: null, budget_override_usd: null });
  });

  it("no saved recipe or place, no restorable session, no staples survive", async () => {
    await useTheApp();
    await resetMyData();
    expect(await productStateOf("u1")).toMatchObject({ restoredSessions: 0, staples: 0, savedState: { recipeIndexes: [], placeIds: [] } });
  });

  it("is repeatable, and a failure says so without claiming success", async () => {
    await useTheApp();
    db.swallowDeletesOn("profiles"); // e.g. an RLS misconfiguration
    expect(await resetMyData()).toEqual({ ok: false, error: "Couldn't finish resetting. Please try again." });
  });

  it("refuses when signed out, and deletes nothing", async () => {
    await useTheApp();
    currentUser = null;
    expect(await resetMyData()).toMatchObject({ ok: false });
    expect(rowsFor("u1").length).toBeGreaterThan(0);
  });

  it("lets the user run onboarding again and use the app as a new user", async () => {
    await useTheApp();
    await resetMyData();
    currentUser = "u1";
    await completeOnboarding({ ...DEFAULT_FORM_VALUES, allergies: ["Soy"] });
    expect(toProfileFormValues(db.tables.profiles[0])).toMatchObject({ allergies: ["Soy"], equipment: null, budget_per_meal_usd: null, dietary_patterns: [] });
  });
});

describe("a reset account is the same as a new account", () => {
  it("every piece of derived first-time state is identical to a user who never existed", async () => {
    await useTheApp("u1");
    await resetMyData();
    expect(await productStateOf("u1")).toEqual(await productStateOf("brand-new-user"));
  });

  it("holds even when the used account had everything set", async () => {
    await useTheApp("u1");
    await saveProfile({ ...toProfileFormValues(db.tables.profiles[0]), sex: "female", age_years: 30, height_cm: 165, weight_kg: 60, activity_level: "lightly_active", goal: "fat_loss" });
    await resetMyData();
    const reset = await productStateOf("u1");
    expect(reset).toEqual(await productStateOf("brand-new-user"));
    expect(reset.stage).toBe("new");
  });
});

describe("Delete my account", () => {
  it("removes all app data, then the auth user (by the verified session's id), then signs out", async () => {
    await useTheApp("u1");
    await useTheApp("u2");
    currentUser = "u1";
    expect(await deleteAccount()).toEqual({ ok: true });
    expect(rowsFor("u1")).toEqual([]);
    expect(rowsFor("u2").length).toBeGreaterThan(0);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalled();
  });

  it("deletes data BEFORE the auth user", async () => {
    await useTheApp();
    let rowsWhenAuthDeleted = -1;
    deleteUser.mockImplementationOnce(async () => {
      rowsWhenAuthDeleted = rowsFor("u1").length;
      return { error: null };
    });
    await deleteAccount();
    expect(rowsWhenAuthDeleted).toBe(0);
  });

  it("without SUPABASE_SERVICE_ROLE_KEY it refuses up front — nothing is touched", async () => {
    await useTheApp();
    adminConfigured = false;
    const before = rowsFor("u1").length;
    expect(await deleteAccount()).toEqual({ ok: false, error: "Deleting an account isn't set up on this server yet." });
    expect(rowsFor("u1")).toHaveLength(before);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("if clearing the data fails, the auth user is kept so the user can retry", async () => {
    await useTheApp();
    db.failTable("decision_sessions", { code: "XX000", message: "boom" });
    const result = await deleteAccount();
    expect(result).toMatchObject({ ok: false });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("if the auth deletion fails after the data is gone, it says so, stays signed in, and a retry finishes", async () => {
    await useTheApp();
    deleteUser.mockResolvedValueOnce({ error: { message: "auth down" } });
    expect(await deleteAccount()).toEqual({ ok: false, error: "Your data was cleared, but the account couldn't be removed. Please try again." });
    expect(rowsFor("u1")).toEqual([]); // an empty-but-valid account: the reset state
    expect(signOut).not.toHaveBeenCalled();
    expect(await deleteAccount()).toEqual({ ok: true });
    expect(deleteUser).toHaveBeenCalledTimes(2);
  });

  it("refuses when signed out", async () => {
    currentUser = null;
    expect(await deleteAccount()).toMatchObject({ ok: false });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("takes no id from the caller — it can only ever act on the signed-in user", () => {
    expect(deleteAccount.length).toBe(0);
    expect(resetMyData.length).toBe(0);
  });
});
