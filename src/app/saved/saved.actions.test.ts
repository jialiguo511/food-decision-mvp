// Saved + its interaction with "not for me" feedback, through the real server
// actions over an in-memory database that applies only the filters the code
// itself writes (see src/test/fakeSupabase.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
let currentUser: string | null = "user-1";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.clientFor(currentUser),
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));

import { recordPlaceFeedback, clearPlaceFeedback } from "../today/actions";
import { removeSaved, saveFromSession, unsaveFromSession } from "./actions";

const nearby = (place_id: string, title = `Place ${place_id}`) => ({
  decision_mode: "nearby",
  role: "best_match",
  title,
  place_id,
  reason: "Close by.",
  look_for: "A grilled chicken bowl.",
  category: "Restaurant",
  address: "1 Main St",
  distance_m: 400,
  open_now: true,
  price_level: null,
  maps_url: `https://maps.example/${place_id}`,
  website_url: null,
});

function seedSession(id: string, user: string, recommendations: unknown[]) {
  db.seed("decision_sessions", { id, user_id: user, context: {}, recommendations });
}

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  seedSession("s1", "user-1", [recipe(), nearby("ChIJ-1"), nearby("ChIJ-2")]);
});

describe("saving recipes", () => {
  it("saves the canonical recipe from the user's own session", async () => {
    expect(await saveFromSession("s1", 0)).toEqual({ ok: true });
    expect(db.count("saved_recipes")).toBe(1);
    expect(db.tables.saved_recipes[0]).toMatchObject({ user_id: "user-1", recipe: recipe() });
  });

  it("saving twice, or the same recipe from another session, is one save (and keeps the original saved-at)", async () => {
    await saveFromSession("s1", 0);
    const savedAt = db.tables.saved_recipes[0].created_at;
    await saveFromSession("s1", 0);
    seedSession("s2", "user-1", [recipe({ reason: "Worded differently.", estimated_calories: 580 })]);
    await saveFromSession("s2", 0);
    expect(db.count("saved_recipes")).toBe(1);
    expect(db.tables.saved_recipes[0].created_at).toBe(savedAt);
  });

  it("a genuinely different recipe is a second save", async () => {
    seedSession("s2", "user-1", [recipe({ title: "Sesame Noodle Bowl" })]);
    await saveFromSession("s1", 0);
    await saveFromSession("s2", 0);
    expect(db.count("saved_recipes")).toBe(2);
  });

  it("unsaves by the same card, and unsaving something unsaved is harmless", async () => {
    await saveFromSession("s1", 0);
    expect(await unsaveFromSession("s1", 0)).toEqual({ ok: true });
    expect(db.count("saved_recipes")).toBe(0);
    expect(await unsaveFromSession("s1", 0)).toEqual({ ok: true });
  });

  it("saved recipes persist independently of the session (survive reload / a newer session)", async () => {
    await saveFromSession("s1", 0);
    db.tables.decision_sessions = []; // the session row is gone; the save is not
    expect(db.count("saved_recipes")).toBe(1);
  });

  it("rejects bad indexes, unknown sessions, and order/snack cards", async () => {
    seedSession("s3", "user-1", [{ decision_mode: "store_snack", role: "best_match", title: "Bar", reason: "r", what_to_look_for: "w", backup: null, watch: null, estimated_calories: 100, estimated_protein_g: 5 }]);
    expect((await saveFromSession("s1", 7)).ok).toBe(false);
    expect((await saveFromSession("nope", 0)).ok).toBe(false);
    expect((await saveFromSession("s3", 0)).ok).toBe(false);
    expect(db.count("saved_recipes")).toBe(0);
  });
});

describe("saving places", () => {
  it("saves by the provider place id with the durable facts", async () => {
    expect(await saveFromSession("s1", 1)).toEqual({ ok: true });
    expect(db.tables.saved_places[0]).toMatchObject({
      user_id: "user-1",
      provider: "google_places",
      place_id: "ChIJ-1",
      name: "Place ChIJ-1",
      look_for: "A grilled chicken bowl.",
    });
  });

  it("the same place from another session is one save; a same-named place with another id is separate", async () => {
    seedSession("s2", "user-1", [nearby("ChIJ-1"), nearby("ChIJ-9", "Place ChIJ-1")]);
    await saveFromSession("s1", 1);
    await saveFromSession("s2", 0);
    expect(db.count("saved_places")).toBe(1);
    await saveFromSession("s2", 1);
    expect(db.count("saved_places")).toBe(2);
  });

  it("unsaves by place id, from the card or from the Saved page", async () => {
    await saveFromSession("s1", 1);
    await saveFromSession("s1", 2);
    await unsaveFromSession("s1", 1);
    expect(db.tables.saved_places.map((p) => p.place_id)).toEqual(["ChIJ-2"]);
    await removeSaved("place", "ChIJ-2");
    expect(db.count("saved_places")).toBe(0);
  });
});

describe("Saved and 'not for me' feedback", () => {
  beforeEach(async () => {
    await saveFromSession("s1", 1);
  });

  it("a hard exclusion removes the place from Saved and keeps the exclusion", async () => {
    const result = await recordPlaceFeedback("ChIJ-1", "dont_like");
    expect(result).toMatchObject({ ok: true, action: "exclude", removedFromSaved: true });
    expect(db.count("saved_places")).toBe(0);
    expect(db.tables.place_feedback[0]).toMatchObject({ place_id: "ChIJ-1", action: "exclude" });
  });

  it("closed and bad experience also remove it; only that place is affected", async () => {
    await saveFromSession("s1", 2);
    await recordPlaceFeedback("ChIJ-1", "closed");
    expect(db.tables.saved_places.map((p) => p.place_id)).toEqual(["ChIJ-2"]);
    await recordPlaceFeedback("ChIJ-2", "bad_experience");
    expect(db.count("saved_places")).toBe(0);
  });

  it("soft downranking does NOT remove a saved place", async () => {
    for (const reason of ["too_expensive", "other"]) {
      const result = await recordPlaceFeedback("ChIJ-1", reason);
      expect(result).toMatchObject({ ok: true, action: "downrank", removedFromSaved: false });
    }
    expect(db.count("saved_places")).toBe(1);
  });

  it("undoing the exclusion does not bring the save back", async () => {
    await recordPlaceFeedback("ChIJ-1", "dont_like");
    await clearPlaceFeedback("ChIJ-1");
    expect(db.count("saved_places")).toBe(0);
  });

  it("an excluded place can't be saved again from a stale card", async () => {
    await recordPlaceFeedback("ChIJ-1", "dont_like");
    const result = await saveFromSession("s1", 1);
    expect(result.ok).toBe(false);
    expect(db.count("saved_places")).toBe(0);
  });

  it("an exclusion by another user doesn't affect this user's Saved", async () => {
    currentUser = "user-2";
    seedSession("s9", "user-2", [nearby("ChIJ-1")]);
    await saveFromSession("s9", 0);
    await recordPlaceFeedback("ChIJ-1", "dont_like");
    currentUser = "user-1";
    expect(db.tables.saved_places.map((p) => p.user_id)).toEqual(["user-1"]);
  });
});

describe("auth and isolation", () => {
  it("does nothing when signed out", async () => {
    currentUser = null;
    expect((await saveFromSession("s1", 0)).ok).toBe(false);
    expect((await unsaveFromSession("s1", 0)).ok).toBe(false);
    expect((await removeSaved("place", "x")).ok).toBe(false);
    expect(db.count("saved_recipes") + db.count("saved_places")).toBe(0);
  });

  it("cannot save from, or remove, another user's data", async () => {
    currentUser = "user-2";
    expect((await saveFromSession("s1", 0)).ok).toBe(false); // s1 belongs to user-1
    currentUser = "user-1";
    await saveFromSession("s1", 0);
    await saveFromSession("s1", 1);
    const recipeId = db.tables.saved_recipes[0].id as string;

    currentUser = "user-2";
    await removeSaved("recipe", recipeId);
    await removeSaved("place", "ChIJ-1");
    expect(db.count("saved_recipes")).toBe(1);
    expect(db.count("saved_places")).toBe(1);
  });
});
