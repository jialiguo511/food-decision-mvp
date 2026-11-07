// The server half of opening Home: what it reads, and that it doesn't read it one
// round trip at a time. Every open of Home used to make about seven Supabase
// reads in a row; the independent ones now run together. The page is called as a
// function (it is an async Server Component) and the props it hands HomeFlow are
// read back, so the restored session, the Kitchen staples and the remembered
// defaults are checked to be exactly what they were.

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookContext } from "@/test/cookFixtures";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
let inFlight = 0;
let maxInFlight = 0;

/** The fake db, but every query takes a real tick, so queries started together
 *  overlap and ones awaited one after another cannot. */
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
              inFlight++;
              maxInFlight = Math.max(maxInFlight, inFlight);
              return new Promise((resolve) => setTimeout(resolve, 5))
                .then(() => (target as PromiseLike<unknown>).then(ok, bad))
                .finally(() => void inFlight--);
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === "function"
            ? (...args: unknown[]) => {
                const out = value.apply(target, args);
                return out === target ? receiver : out;
              }
            : value;
        },
      });
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => slowClient("user-1") }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "user-1" }) }));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true }));
vi.mock("@/components/AppShell", () => ({ default: () => null }));
vi.mock("@/components/SetupNotice", () => ({ default: () => null }));
vi.mock("./HomeFlow", () => ({ default: () => null }));

import TodayPage from "./page";

/** The props the page gave HomeFlow. */
async function homeProps() {
  const shell = (await TodayPage()) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
  return shell.props.children.props;
}

beforeEach(() => {
  db = createFakeDb();
  inFlight = 0;
  maxInFlight = 0;
});

describe("opening Home", () => {
  it("the independent reads (profile, latest session, Kitchen staples, recent settings) start together", async () => {
    db.seed("profiles", { id: "user-1", prefs: { explicit_fields: [] } });
    await homeProps();
    expect(maxInFlight).toBeGreaterThanOrEqual(4);
  });

  it("a recent session is restored with its pick, Kitchen staples and remembered settings intact", async () => {
    db.seed("profiles", { id: "user-1", allergies: ["peanuts"], equipment: ["Stovetop"], prefs: { explicit_fields: ["equipment"] } });
    db.seed("kitchen_staples", { user_id: "user-1", name: "Soy sauce" });
    db.seed("decision_sessions", {
      id: "s1",
      user_id: "user-1",
      context: cookContext({ hunger: "very_hungry" }),
      recommendations: [recipe({ title: "Rice Bowl" })],
      chosen_index: 0,
      created_at: new Date().toISOString(),
    });
    db.seed("meal_feedback", { id: "f1", user_id: "user-1", session_id: "s1", did_eat: true, note: null });

    const props = await homeProps();
    expect((props.initialSession as { session_id: string }).session_id).toBe("s1");
    expect(props.initialChosenIndex).toBe(0);
    expect(props.initialFeedback).toEqual({ id: "f1", didEat: true, note: null });
    expect(props.kitchenStaples).toEqual(["Soy sauce"]);
    expect(props.equipmentKnown).toBe(true);
    expect(props.avoidsFoods).toBe(true);
    // The mode they used last opens with its last answers.
    expect((props.defaults as { mode: string; remembered: Record<string, boolean> }).remembered.cook).toBe(true);
  });

  it("an old session is not restored (6 h window), but its settings are still remembered", async () => {
    db.seed("profiles", { id: "user-1", prefs: { explicit_fields: [] } });
    db.seed("decision_sessions", {
      id: "old",
      user_id: "user-1",
      context: cookContext({ hunger: "light" }),
      recommendations: [recipe({ title: "Old Dish" })],
      chosen_index: null,
      created_at: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    });
    const props = await homeProps();
    expect(props.initialSession).toBeNull();
    expect((props.defaults as { remembered: Record<string, boolean> }).remembered.cook).toBe(true);
  });

  it("a brand-new user gets first-run setup and no restored anything", async () => {
    const props = await homeProps();
    expect(props.initialSession).toBeNull();
    expect(props.initialChosenIndex).toBeNull();
    expect(props.initialFeedback).toBeNull();
    expect(props.initialPlaceFeedback).toEqual({});
    expect(props.kitchenStaples).toEqual([]);
    expect(props.onboardingProfile).not.toBeNull();
  });
});
