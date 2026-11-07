// Save, recipe and restaurant, against REAL Postgres: the project's actual
// schema.sql with Row Level Security, GRANTs and constraints, driven through the
// real server actions and the same queries the Saved page and the recommend
// route use. The in-memory fake behind the other Saved tests can't fail the way
// a real database does — no RLS, no grants, no missing table — and "the tests
// pass" didn't mean Save worked. These are the layers it can actually break at:
//
//   click → server action → authenticated user → stored session → payload
//     → INSERT/upsert → RLS + constraints → Saved-page read → saved state on reload

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pickNearby } from "@/lib/recommend/nearbyPicks";
import { parseRecommendations } from "@/lib/recommend/output";
import { loadSavedState } from "@/lib/saved/savedQuery";
import { parseSavedPlaceRow, parseSavedRecipe } from "@/lib/saved/saved";
import { createRealDb, readSql, type RealDb } from "@/test/realDb";
import { recipe } from "@/test/savedFixtures";
import type { CookConstraints, NearbyRecommendation, Recommendation } from "@/lib/types";
import type { PlaceCandidate } from "@/lib/places/candidates";

let real: RealDb;
let currentUser: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => real.clientFor(currentUser),
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));

import { saveFromSession, unsaveFromSession } from "./actions";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NOT_IN_AUTH = "99999999-9999-4999-8999-999999999999";

const CONSTRAINTS: CookConstraints = {
  decision_mode: "cook",
  max_minutes: 60,
  budget_usd: 50,
  budget_source: "override",
  equipment: ["Stovetop"],
  equipment_known: true,
  no_cooking: false,
  no_shopping: false,
  allergies: [],
  dietary: { patterns: [], other: null },
};

/** What the model returns for one recipe slot, run through the real validator. */
function generatedRecipes(): Recommendation[] {
  const fields = (title: string) => {
    const { decision_mode: _m, role: _r, ...rest } = recipe({ title, equipment: ["Stovetop"], steps: [`Cook the ${title}.`] });
    void _m;
    void _r;
    return rest;
  };
  const parsed = parseRecommendations(
    JSON.stringify({ best_match: fields("Rice Bowl"), lowest_effort: fields("Toast"), alternative: fields("Noodles") }),
    CONSTRAINTS,
  );
  if (!parsed.ok) throw new Error(parsed.details.join("; "));
  return parsed.recommendations;
}

const candidate = (id: string, over: Partial<PlaceCandidate> = {}): PlaceCandidate => ({
  id,
  name: `Place ${id}`,
  category: "Restaurant",
  primary_type: `type_${id}`,
  address: "1 Main St",
  location: { latitude: 1, longitude: 1 },
  operational: true,
  open_now: true,
  price_level: "moderate",
  maps_url: `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
  website_url: "https://example.com",
  distance_m: 300,
  ...over,
});

/** What the nearby route stores: the deterministic picks (rule-written reasons). */
function generatedPlaces(): NearbyRecommendation[] {
  return pickNearby([candidate("a"), candidate("b", { distance_m: 900 }), candidate("c", { distance_m: 1500 })], {
    meal_budget: "no_preference",
    travel: "no_preference",
    craving_category: "no_preference",
    craving_note: null,
  });
}

/** Exactly what POST /api/recommend does: insert as the signed-in user. */
async function storeSession(user: string, recommendations: unknown[]): Promise<string> {
  const { data, error } = await real.clientFor(user).from("decision_sessions").insert({ user_id: user, context: {}, recommendations }).select("id").single();
  if (error) throw new Error(`session insert: ${error.code} ${error.message}`);
  return (data as { id: string }).id;
}

/** The Saved page's own reads. */
async function savedPageRecipes(user: string) {
  const { data } = await real.clientFor(user).from("saved_recipes").select("id, recipe, created_at").eq("user_id", user).order("created_at", { ascending: false }).limit(200);
  return ((data as { id: string; recipe: unknown }[]) ?? []).flatMap((r) => {
    const parsed = parseSavedRecipe(r.recipe);
    return parsed ? [parsed] : [];
  });
}
async function savedPagePlaces(user: string) {
  const { data } = await real
    .clientFor(user)
    .from("saved_places")
    .select("place_id, name, address, category, maps_url, website_url, look_for, created_at")
    .eq("user_id", user)
    .eq("provider", "google_places")
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data as unknown[]) ?? []).flatMap((r) => {
    const parsed = parseSavedPlaceRow(r);
    return parsed ? [parsed] : [];
  });
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  real = await createRealDb({ sql: [readSql("supabase/schema.sql")] });
  await real.addUser(ME);
  await real.addUser(OTHER);
});
afterAll(() => real.db.close());
beforeEach(async () => {
  currentUser = ME;
  await real.admin("delete from public.saved_recipes");
  await real.admin("delete from public.saved_places");
  await real.admin("delete from public.decision_sessions");
  await real.admin("delete from public.place_feedback");
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("recipe Save", () => {
  it("saves, the Saved page reads it back, and the saved state survives a reload", async () => {
    const recs = generatedRecipes();
    const sid = await storeSession(ME, recs);

    expect(await saveFromSession(sid, 0)).toEqual({ ok: true });
    expect(errorLog).not.toHaveBeenCalled();

    // The Saved page.
    expect((await savedPageRecipes(ME)).map((r) => r.title)).toEqual(["Rice Bowl"]);
    // The button state on a "reload": a fresh read of the same set (and a different session of it).
    const state = await loadSavedState(real.clientFor(ME) as never, ME, recs);
    expect(state.recipeIndexes).toEqual([0]);
    const sid2 = await storeSession(ME, recs);
    expect(sid2).not.toBe(sid);
    expect((await loadSavedState(real.clientFor(ME) as never, ME, recs)).recipeIndexes).toEqual([0]);
  });

  it("unsave removes it from Saved and from the button state, and is harmless twice", async () => {
    const recs = generatedRecipes();
    const sid = await storeSession(ME, recs);
    await saveFromSession(sid, 1);
    expect(await unsaveFromSession(sid, 1)).toEqual({ ok: true });
    expect(await unsaveFromSession(sid, 1)).toEqual({ ok: true });
    expect(await savedPageRecipes(ME)).toEqual([]);
    expect((await loadSavedState(real.clientFor(ME) as never, ME, recs)).recipeIndexes).toEqual([]);
  });

  it("tapping Save many times at once leaves exactly one row", async () => {
    const sid = await storeSession(ME, generatedRecipes());
    const results = await Promise.all(Array.from({ length: 6 }, () => saveFromSession(sid, 0)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await real.admin("select 1 from public.saved_recipes")).toHaveLength(1);
  });

  it("one stored card that no longer parses doesn't block saving the others", async () => {
    const [good, ...rest] = generatedRecipes();
    const sid = await storeSession(ME, [{ decision_mode: "cook", title: "Stale shape" }, good, ...rest]);
    expect((await saveFromSession(sid, 0)).ok).toBe(false);
    expect(await saveFromSession(sid, 1)).toEqual({ ok: true });
  });
});

describe("restaurant Save", () => {
  it("saves a place, the Saved page reads it back, and the saved state survives a reload", async () => {
    const places = generatedPlaces();
    const sid = await storeSession(ME, places);

    expect(await saveFromSession(sid, 0)).toEqual({ ok: true });
    expect(errorLog).not.toHaveBeenCalled();

    const saved = await savedPagePlaces(ME);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ place_id: places[0].place_id, name: places[0].title, maps_url: places[0].maps_url });
    expect((await loadSavedState(real.clientFor(ME) as never, ME, places)).placeIds).toEqual([places[0].place_id]);
  });

  it("saves a place whose wording the model has since added (enriched), and one still on its rule-written reason", async () => {
    const places = generatedPlaces();
    const enriched = places.map((p, i) => (i === 0 ? { ...p, reason: "Close and open now.", look_for: "A grilled chicken bowl, sauce on the side.", enriched: true } : p));
    const sid = await storeSession(ME, enriched);
    expect((await saveFromSession(sid, 0)).ok).toBe(true);
    expect((await saveFromSession(sid, 1)).ok).toBe(true);
    const saved = await savedPagePlaces(ME);
    expect(saved).toHaveLength(2);
    expect(saved.find((p) => p.place_id === places[0].place_id)?.look_for).toBe("A grilled chicken bowl, sauce on the side.");
  });

  it("is one row however often it is tapped, and from any session", async () => {
    const places = generatedPlaces();
    const sid = await storeSession(ME, places);
    const sid2 = await storeSession(ME, places);
    await Promise.all([saveFromSession(sid, 0), saveFromSession(sid, 0), saveFromSession(sid2, 0), saveFromSession(sid2, 0)]);
    expect(await real.admin("select 1 from public.saved_places")).toHaveLength(1);
  });

  it("unsave removes it", async () => {
    const sid = await storeSession(ME, generatedPlaces());
    await saveFromSession(sid, 0);
    expect(await unsaveFromSession(sid, 0)).toEqual({ ok: true });
    expect(await savedPagePlaces(ME)).toEqual([]);
  });

  it("a place marked 'not for me' can't be saved", async () => {
    const places = generatedPlaces();
    const sid = await storeSession(ME, places);
    await real.clientFor(ME).from("place_feedback").insert({ user_id: ME, provider: "google_places", place_id: places[0].place_id, action: "exclude", reason: "dont_like" });
    expect((await saveFromSession(sid, 0)).ok).toBe(false);
    expect(await real.admin("select 1 from public.saved_places")).toHaveLength(0);
  });
});

describe("who can save what (RLS)", () => {
  it("another account can't save from my session or see what I saved", async () => {
    const sid = await storeSession(ME, generatedRecipes());
    await saveFromSession(sid, 0);
    currentUser = OTHER;
    const result = await saveFromSession(sid, 0);
    expect(result.ok).toBe(false);
    expect(await savedPageRecipes(OTHER)).toEqual([]);
    expect(await real.admin("select user_id from public.saved_recipes")).toEqual([{ user_id: ME }]);
  });

  it("signed out is refused before any query", async () => {
    currentUser = null;
    expect(await saveFromSession("whatever", 0)).toEqual({ ok: false, error: "You are signed out. Please sign in again." });
  });
});

describe("failures are diagnosable (and safe in production)", () => {
  it("a login whose user isn't in this database's auth.users: the FK violation is logged with its cause", async () => {
    // The session is stored by the owner (a user the database doesn't know can't insert one itself).
    await real.admin("insert into public.decision_sessions (id, user_id, context, recommendations) values (gen_random_uuid(), $1, '{}', $2::jsonb)", [ME, JSON.stringify(generatedRecipes())]).catch(() => {});
    const [{ id }] = await real.admin<{ id: string }>("select id from public.decision_sessions limit 1");
    // Re-point the session at a user absent from auth.users by disabling the FK for this setup only.
    await real.admin("alter table public.decision_sessions disable trigger all");
    await real.admin("alter table public.decision_sessions drop constraint decision_sessions_user_id_fkey");
    await real.admin("update public.decision_sessions set user_id = $1", [NOT_IN_AUTH]);
    currentUser = NOT_IN_AUTH;
    const result = await saveFromSession(id, 0);
    expect(result.ok).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("[saved] save recipe failed", expect.objectContaining({ operation: "save recipe", item_type: "recipe", code: "23503", likely_cause: expect.stringMatching(/auth\.users/) }));
    // Put the schema back for the other tests.
    await real.admin("delete from public.decision_sessions");
    await real.admin("alter table public.decision_sessions add constraint decision_sessions_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade");
  });

  it("a database that never ran the Saved migration: PGRST205 with the migration to run, in the log and (dev) on the screen", async () => {
    const old = await createRealDb();
    await old.addUser(ME);
    await old.db.exec(`create table public.decision_sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), context jsonb not null default '{}', recommendations jsonb not null default '[]', chosen_index int, created_at timestamptz not null default now());
      alter table public.decision_sessions enable row level security;
      create policy own on public.decision_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
      grant select, insert, update, delete on public.decision_sessions to authenticated;`);
    const swap = real;
    real = old;
    try {
      const sid = await storeSession(ME, generatedRecipes());
      const result = await saveFromSession(sid, 0);
      expect(result).toMatchObject({ ok: false, error: "Couldn't save that. Please try again." });
      expect(result.ok === false && result.diagnostic).toMatch(/PGRST205.*2026-09-30_saved\.sql/);
      expect(errorLog).toHaveBeenCalledWith("[saved] save recipe failed", expect.objectContaining({ code: "PGRST205", operation: "save recipe", item_type: "recipe" }));
    } finally {
      real = swap;
      await old.db.close();
    }
  });

  it("in production the person gets no diagnostic — only the simple message", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await real.admin("alter table public.saved_recipes rename to saved_recipes_gone");
      const sid = await storeSession(ME, generatedRecipes());
      const result = await saveFromSession(sid, 0);
      expect(result).toEqual({ ok: false, error: "Couldn't save that. Please try again." });
      expect(errorLog).toHaveBeenCalled();
    } finally {
      await real.admin("alter table public.saved_recipes_gone rename to saved_recipes");
      vi.unstubAllEnvs();
    }
  });
});

describe("the optional repair migration (2026-10-02_saved_repair.sql)", () => {
  /** A database whose Saved tables exist in an OLDER shape: no recipe_key column, no unique keys. */
  async function oldShapeDb() {
    const old = await createRealDb({ sql: [readSql("supabase/schema.sql")] });
    await old.addUser(ME);
    await old.db.exec(`
      drop table public.saved_recipes; drop table public.saved_places;
      create table public.saved_recipes (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, recipe_hash text, recipe jsonb);
      create table public.saved_places (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, place_id text, name text);
      alter table public.saved_recipes enable row level security; alter table public.saved_places enable row level security;
      create policy "own saved recipes" on public.saved_recipes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
      create policy "own saved places" on public.saved_places for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
      grant select, insert, update, delete on public.saved_recipes, public.saved_places to authenticated;`);
    return old;
  }

  it("an older-shaped table fails Save with a diagnosable code; the repair fixes it, for recipes and places", async () => {
    const old = await oldShapeDb();
    const swap = real;
    real = old;
    try {
      const recipesSession = await storeSession(ME, generatedRecipes());
      const placesSession = await storeSession(ME, generatedPlaces());
      const before = await saveFromSession(recipesSession, 0);
      expect(before.ok).toBe(false);
      expect(errorLog).toHaveBeenCalledWith("[saved] save recipe failed", expect.objectContaining({ code: "PGRST204", likely_cause: expect.stringMatching(/saved_repair\.sql/) }));
      expect((await saveFromSession(placesSession, 0)).ok).toBe(false);

      await old.db.exec(readSql("supabase/migrations/2026-10-02_saved_repair.sql"));

      expect(await saveFromSession(recipesSession, 0)).toEqual({ ok: true });
      expect(await saveFromSession(recipesSession, 0)).toEqual({ ok: true }); // idempotent
      expect(await saveFromSession(placesSession, 0)).toEqual({ ok: true });
      expect(await old.admin("select 1 from public.saved_recipes where recipe_key is not null")).toHaveLength(1);
      expect(await old.admin("select 1 from public.saved_places")).toHaveLength(1);
    } finally {
      real = swap;
      await old.db.close();
    }
  });

  it("changes nothing on a database that is already right (re-runnable)", async () => {
    const sid = await storeSession(ME, generatedRecipes());
    await saveFromSession(sid, 0);
    await real.db.exec(readSql("supabase/migrations/2026-10-02_saved_repair.sql"));
    await real.db.exec(readSql("supabase/migrations/2026-10-02_saved_repair.sql"));
    expect(await real.admin("select 1 from public.saved_recipes")).toHaveLength(1);
    expect(await saveFromSession(sid, 0)).toEqual({ ok: true });
  });
});
