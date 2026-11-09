// POST /api/recommend for Cook / Get food (by type) / Snack: where the time goes
// is measured, independent reads run together, and persistence (which Save and
// Choose depend on) still happens before the cards are shown.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
let concurrent = 0;
let maxConcurrent = 0;
const generate = vi.fn();

/** The fake db, but every query takes a real tick — so reads that are started
 *  together overlap (and ones awaited one after another can't). */
function slowClient(userId: string) {
  const client = db.clientFor(userId);
  return {
    ...client,
    from: (table: string) => {
      const query = client.from(table) as unknown as PromiseLike<unknown>;
      return new Proxy(query as object, {
        get(target, prop, receiver) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => {
              concurrent++;
              maxConcurrent = Math.max(maxConcurrent, concurrent);
              return new Promise((resolve) => setTimeout(resolve, 5))
                .then(() => (target as PromiseLike<unknown>).then(ok, bad))
                .finally(() => void concurrent--);
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? (...args: unknown[]) => {
            const out = value.apply(target, args);
            return out === target ? receiver : out;
          } : value;
        },
      });
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => slowClient("user-1") }));
vi.mock("./claude", () => ({ generateRecommendations: (...args: unknown[]) => generate(...args) }));
vi.mock("@/lib/places", () => ({ resolvePlacesProvider: () => null }));

import { POST } from "./route";

const COOK = { decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy", craving: null, ingredients_on_hand: [], budget_override_usd: 10 };
const request = (context: unknown, requestId = "abc123") =>
  POST(new Request("http://localhost/api/recommend", { method: "POST", headers: { "X-Request-Id": requestId }, body: JSON.stringify({ context }) }));

beforeEach(() => {
  db = createFakeDb();
  concurrent = 0;
  maxConcurrent = 0;
  generate.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
  // Behavioral hints are off for the public beta; these tests are about the path that reads them.
  vi.stubEnv("BEHAVIORAL_HINTS", "on");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  generate.mockImplementation(async (_c: unknown, _i: unknown, _cands: unknown, timer?: { record: (n: string, ms: number) => void }) => {
    timer?.record("prompt", 12);
    timer?.record("model", 5400);
    timer?.record("parse", 25);
    return { ok: true, recommendations: [recipe({ title: "Rice Bowl" })], insufficientInventory: false, model: "m" };
  });
});

describe("Cook request — inferred memory is off unless switched on", () => {
  it("by default no history is read back into the request at all", async () => {
    vi.stubEnv("BEHAVIORAL_HINTS", "");
    const res = await request(COOK);
    expect(res.status).toBe(200);
    expect(res.headers.get("Server-Timing") ?? "").not.toContain("hints;dur=");
    const input = JSON.stringify(generate.mock.calls[0][1]);
    expect(input).not.toContain("behavioral_hints");
  });
});

describe("Cook request — timing and the critical path", () => {
  it("reports every stage the user waits on, including the model's, in one Server-Timing header", async () => {
    const res = await request(COOK);
    expect(res.status).toBe(200);
    const timing = res.headers.get("Server-Timing") ?? "";
    for (const stage of ["auth", "preferences", "profile", "staples", "hints", "prompt", "model", "parse", "session_write", "persist", "saved_state", "total"]) {
      expect(timing, stage).toContain(`${stage};dur=`);
    }
  });

  it("logs the table once per request, labelled with the mode", async () => {
    const info = vi.mocked(console.info);
    await request(COOK);
    const table = info.mock.calls.map((c) => String(c[0])).find((m) => /^\[Cook timing/.test(m));
    expect(table).toMatch(/\[Cook timing abc123\]/);
    expect(table).toMatch(/model\s+5400 ms/);
    expect(table).toMatch(/TOTAL/);
  });

  it("the table accounts for the whole request: auth, preferences, prompt, model, parse, session write, other, TOTAL", async () => {
    const info = vi.mocked(console.info);
    await request(COOK);
    const table = info.mock.calls.map((c) => String(c[0])).find((m) => /^\[Cook timing/.test(m)) ?? "";
    for (const row of [/auth\s+\d+ ms/, /preferences\s+\d+ ms\s+\(in parallel: profile/, /prompt\s+12 ms/, /model\s+5400 ms/, /parse\s+25 ms/, /session write\s+\d+ ms/, /other\s+\d+ ms/, /TOTAL\s+\d+ ms/]) {
      expect(table).toMatch(row);
    }
  });

  it("one request is one `received` line and, at most, the model calls it makes — tagged with the browser's id", async () => {
    const info = vi.mocked(console.info);
    await request(COOK, "req-1");
    const lines = info.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.startsWith("[recommend] received")).length).toBe(1);
    expect(lines).toContain("[recommend] received requestId=req-1");
  });

  it("an id that isn't shaped like one is ignored, not echoed into the logs", async () => {
    const info = vi.mocked(console.info);
    await request(COOK, "bad id; injected");
    expect(info.mock.calls.map((c) => String(c[0]))).toContain("[recommend] received requestId=none");
  });

  it("starts the profile, staples and hints reads together instead of one after another", async () => {
    await request(COOK);
    expect(maxConcurrent).toBeGreaterThanOrEqual(3);
  });

  it("the model is asked once — one call produces all the recipes — with the timer so prompt/model/parse are measured", async () => {
    await request(COOK);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][3]).toBeDefined();
  });

  it("the session row exists before the cards do (Save and Choose depend on it), and the response carries its id", async () => {
    const body = await (await request(COOK)).json();
    expect(db.count("decision_sessions")).toBe(1);
    expect(body.session_id).toBe(db.tables.decision_sessions[0].id);
  });

  it("a request that fails still reports its timing and leaves no session behind", async () => {
    generate.mockResolvedValue({ ok: false, code: "upstream_timeout", message: "slow" });
    const res = await request(COOK);
    expect(res.status).toBe(504);
    expect(res.headers.get("Server-Timing")).toContain("total;dur=");
    expect(db.count("decision_sessions")).toBe(0);
  });

  it("a user with personal targets gets their signature on the set; one without gets none", async () => {
    expect((await (await request(COOK)).json()).targets_sig).toBeUndefined();
    db.seed("profiles", { id: "user-1", goal: "fat_loss", prefs: { explicit_fields: ["goal"] }, sex: "male", age_years: 30, height_cm: 180, weight_kg: 80, activity_level: "moderately_active" });
    expect((await (await request(COOK)).json()).targets_sig).toMatch(/^fat_loss\|/);
  });

  it("snack and Get food by type take the same single-call path", async () => {
    await request({ decision_mode: "store_snack", hunger: "normal", craving_type: "salty" });
    await request({ decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "delivery", meal_budget: "no_preference" });
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe("what the Profile says reaches the model", () => {
  const inputOfCall = (n = 0) => generate.mock.calls[n][1] as {
    hard_constraints: Record<string, unknown>;
    soft_preferences: Record<string, unknown>;
  };

  it("Cook: allergies, dietary pattern, equipment and Kitchen staples arrive as constraints, and the goal and targets as soft guidance", async () => {
    db.seed("profiles", {
      id: "user-1",
      goal: "muscle_gain",
      allergies: ["peanuts"],
      dislikes: ["olives"],
      cuisines: ["Thai"],
      equipment: ["Stovetop"],
      prefs: { explicit_fields: ["goal", "equipment"], dietary: { patterns: ["vegetarian"], other: null } },
      sex: "male",
      age_years: 30,
      height_cm: 180,
      weight_kg: 80,
      activity_level: "moderately_active",
    });
    db.seed("kitchen_staples", { user_id: "user-1", name: "Soy sauce" });
    await request(COOK);

    const input = inputOfCall();
    expect(input.hard_constraints).toMatchObject({ allergies: ["peanuts"], equipment: ["Stovetop"], no_cooking: false, dietary: { patterns: ["vegetarian"] } });
    expect(input.soft_preferences).toMatchObject({ goal: "muscle_gain", disliked_foods: ["olives"], preferred_cuisines: ["Thai"] });
    expect(input.soft_preferences.ingredients_on_hand).toContain("Soy sauce");
    // Height, weight and goal become a real calorie and protein target for this person.
    expect(input.soft_preferences.daily_calorie_target_kcal as number).toBeGreaterThan(2500);
    expect(input.soft_preferences.daily_protein_target_g as number).toBeGreaterThan(120);
  });

  it("different body details give the model different targets — they are not collected for show", async () => {
    const body = { sex: "female", age_years: 30, height_cm: 160, weight_kg: 52, activity_level: "lightly_active" };
    db.seed("profiles", { id: "user-1", goal: "fat_loss", prefs: { explicit_fields: ["goal"] }, ...body });
    await request(COOK);
    // The user edits their details in Me: the same row, new numbers (seed appends, so replace it).
    db.tables.profiles = [{ id: "user-1", goal: "fat_loss", prefs: { explicit_fields: ["goal"] }, sex: "male", age_years: 30, height_cm: 185, weight_kg: 95, activity_level: "very_active" }];
    await request(COOK);
    const [small, large] = [inputOfCall(0), inputOfCall(1)];
    expect(large.soft_preferences.daily_calorie_target_kcal as number).toBeGreaterThan((small.soft_preferences.daily_calorie_target_kcal as number) + 500);
    expect(large.soft_preferences.daily_protein_target_g as number).toBeGreaterThan(small.soft_preferences.daily_protein_target_g as number);
  });

  it("no body details → no calorie target is invented", async () => {
    db.seed("profiles", { id: "user-1", goal: "fat_loss", prefs: { explicit_fields: ["goal"] } });
    await request(COOK);
    expect(inputOfCall().soft_preferences.daily_calorie_target_kcal).toBeNull();
  });

  it("equipment the user never stated means no appliance is assumed", async () => {
    await request(COOK); // no profile row at all
    expect(inputOfCall().hard_constraints).toMatchObject({ equipment_known: false, no_cooking: true, equipment: [] });
  });

  it('"No cooking at all" reaches Cook as a hard no-cooking constraint', async () => {
    db.seed("profiles", { id: "user-1", equipment: ["No cooking at all"], prefs: { explicit_fields: ["equipment"] } });
    await request(COOK);
    expect(inputOfCall().hard_constraints).toMatchObject({ no_cooking: true, equipment: [] });
  });

  it("allergies reach Get food and Snack too, not only Cook", async () => {
    db.seed("profiles", { id: "user-1", allergies: ["shellfish"] });
    await request({ decision_mode: "store_snack", hunger: "normal", craving_type: "salty" });
    await request({ decision_mode: "order", hunger: "normal", craving_category: "no_preference", craving_note: null, method: "delivery", meal_budget: "no_preference" });
    expect(inputOfCall(0).hard_constraints).toMatchObject({ allergies: ["shellfish"] });
    expect(inputOfCall(1).hard_constraints).toMatchObject({ allergies: ["shellfish"] });
  });

  it("a request the model rejects twice comes back as a clear failure, leaves no session, and the next try works", async () => {
    generate.mockResolvedValueOnce({ ok: false, code: "constraint_violation", message: "broke a rule", details: ["x"] });
    const failed = await request(COOK);
    expect(failed.status).toBe(502);
    expect((await failed.json()).error.code).toBe("constraint_violation");
    expect(db.count("decision_sessions")).toBe(0);

    const retried = await request(COOK); // "Try again"
    expect(retried.status).toBe(200);
    expect(db.count("decision_sessions")).toBe(1);
  });
});
