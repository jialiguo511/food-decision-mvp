// Save, end to end, with a recommendation that went through the SAME path a
// real one does: model JSON → parseRecommendations → stored on decision_sessions
// → saveFromSession → saved_recipes → parseSavedRecipe (what the Saved page
// reads). Plus the failures that actually happen — a database that never had the
// Saved migration applied was the cause of "Couldn't save that" — and what each
// leaves in the server log for whoever debugs it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";
import { parseRecommendations } from "@/lib/recommend/output";
import type { CookConstraints } from "@/lib/types";
import { parseSavedRecipe, recipeKey } from "@/lib/saved/saved";
import { friendlyActionError } from "../today/results/errorCopy";

let db = createFakeDb();
let currentUser: string | null = "user-1";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.clientFor(currentUser),
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));

import { saveFromSession, unsaveFromSession } from "./actions";

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

/** What the model returns for one recipe slot: the fields only, no role / mode. */
function modelFields(title: string) {
  const { decision_mode: _m, role: _r, ...fields } = recipe({ title, equipment: ["Stovetop"], steps: [`Cook the ${title}.`] });
  void _m;
  void _r;
  return fields;
}

function generate() {
  const parsed = parseRecommendations(
    JSON.stringify({ best_match: modelFields("Rice Bowl"), lowest_effort: modelFields("Toast"), alternative: modelFields("Noodles") }),
    CONSTRAINTS,
  );
  if (!parsed.ok) throw new Error(parsed.details.join("; "));
  return parsed.recommendations;
}

/** Exactly what POST /api/recommend inserts. */
const seedSession = (id: string, user: string, recommendations: unknown) => db.seed("decision_sessions", { id, user_id: user, context: {}, recommendations });

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("saving a generated recipe", () => {
  it("saves it, and the Saved page's reader gets the same recipe back", async () => {
    const recs = generate();
    seedSession("s1", "user-1", recs);
    expect(await saveFromSession("s1", 0)).toEqual({ ok: true });

    const row = db.tables.saved_recipes[0];
    expect(row).toMatchObject({ user_id: "user-1", recipe_key: recipeKey(recs[0] as never) });
    expect(parseSavedRecipe(row.recipe)).toMatchObject({ title: "Rice Bowl", role: "best_match", steps: ["Cook the Rice Bowl."] });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("saves from a session row written before recommendations carried a decision_mode", async () => {
    const legacy = generate().map(({ decision_mode: _d, ...rest }) => (void _d, rest));
    seedSession("old", "user-1", legacy);
    expect(await saveFromSession("old", 1)).toEqual({ ok: true });
    expect(db.count("saved_recipes")).toBe(1);
  });

  it("unsaving removes exactly that recipe", async () => {
    seedSession("s1", "user-1", generate());
    await saveFromSession("s1", 0);
    await saveFromSession("s1", 1);
    expect(await unsaveFromSession("s1", 0)).toEqual({ ok: true });
    expect(db.count("saved_recipes")).toBe(1);
  });
});

describe("saving fails safely — and says why in the server log", () => {
  it("the Saved tables were never created (migration not run): the real cause is logged, with the fix", async () => {
    seedSession("s1", "user-1", generate());
    db.failTable("saved_recipes", { code: "PGRST205", message: "Could not find the table 'public.saved_recipes' in the schema cache" });
    const result = await saveFromSession("s1", 0);
    expect(result.ok).toBe(false);
    expect(errorLog).toHaveBeenCalledWith(
      "[saved] save recipe failed",
      expect.objectContaining({ code: "PGRST205", operation: "save recipe", item_type: "recipe", likely_cause: expect.stringMatching(/2026-09-30_saved\.sql/) }),
    );
  });

  it("a permissions / RLS refusal is logged with its code", async () => {
    seedSession("s1", "user-1", generate());
    db.failTable("saved_recipes", { code: "42501", message: "permission denied for table saved_recipes" });
    expect((await saveFromSession("s1", 0)).ok).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("[saved] save recipe failed", expect.objectContaining({ code: "42501" }));
  });

  it("the person only ever sees simple copy, never the database message", () => {
    const raw = "Could not find the table 'public.saved_recipes' in the schema cache";
    expect(friendlyActionError(raw, "Couldn't save that. Please try again.")).toBe("Couldn't save that. Please try again.");
  });

  it("another user's session can't be saved from", async () => {
    seedSession("theirs", "user-2", generate());
    expect(await saveFromSession("theirs", 0)).toMatchObject({ ok: false, error: "That recommendation couldn't be found." });
    expect(db.count("saved_recipes")).toBe(0);
  });

  it("a session read failure is logged, not swallowed", async () => {
    db.failTable("decision_sessions", { code: "42501", message: "permission denied for table decision_sessions" });
    expect((await saveFromSession("s1", 0)).ok).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("[saved] read session failed", expect.objectContaining({ code: "42501", item_type: "session" }));
  });

  it("an unreadable stored recommendation is logged", async () => {
    seedSession("bad", "user-1", [{ decision_mode: "cook", title: "No steps" }]);
    expect((await saveFromSession("bad", 0)).ok).toBe(false);
    expect(errorLog).toHaveBeenCalledWith("[saved] parse stored recommendation failed", expect.objectContaining({ item_type: "session" }));
  });

  it("signed out", async () => {
    currentUser = null;
    expect(await saveFromSession("s1", 0)).toEqual({ ok: false, error: "You are signed out. Please sign in again." });
  });
});
