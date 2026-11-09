// The feedback action over the in-memory database: signed-out, bad input, the rate limit
// (the same metering as a paid call), and what is actually stored.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";

let db = createFakeDb();
let currentUser: string | null = "user-1";
const consume = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.clientFor(currentUser),
  getUser: async () => (currentUser ? { id: currentUser } : null),
}));
vi.mock("@/lib/usage/consume", () => ({ consumeUsage: (...args: unknown[]) => consume(...args) }));

import { submitFeedback } from "./actions";

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  consume.mockReset();
  consume.mockResolvedValue({ allowed: true, used: 1, limit: 5 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("submitFeedback", () => {
  it("stores the message under the signed-in person, with the page and version and nothing else", async () => {
    expect(await submitFeedback({ kind: "bug", message: "Cards never showed", contact: "a@b.co", page: "/today?x=secret" })).toEqual({ ok: true });
    expect(db.count("feedback")).toBe(1);
    expect(db.tables.feedback[0]).toMatchObject({ user_id: "user-1", kind: "bug", message: "Cards never showed", contact: "a@b.co", page: "/today" });
    expect(typeof db.tables.feedback[0].app_version).toBe("string"); // the build, not anything about the person
    expect(consume).toHaveBeenCalledWith(expect.anything(), "feedback");
  });

  it("signed out: nothing is stored and nothing is spent", async () => {
    currentUser = null;
    const result = await submitFeedback({ kind: "idea", message: "hello" });
    expect(result.ok).toBe(false);
    expect(db.count("feedback")).toBe(0);
    expect(consume).not.toHaveBeenCalled();
  });

  it("bad input is refused before the database or the allowance is touched", async () => {
    for (const bad of [{ kind: "bug", message: "" }, { kind: "nope", message: "x" }, { kind: "bug", message: "x".repeat(5000) }]) {
      expect((await submitFeedback(bad)).ok).toBe(false);
    }
    expect((await submitFeedback(null as never)).ok).toBe(false);
    expect(db.count("feedback")).toBe(0);
    expect(consume).not.toHaveBeenCalled();
  });

  it("over the daily allowance: says so kindly and stores nothing", async () => {
    consume.mockResolvedValue({ allowed: false, reason: "limit", used: 5, limit: 5 });
    const result = await submitFeedback({ kind: "bug", message: "again" });
    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.error).toMatch(/tomorrow/i);
    expect(db.count("feedback")).toBe(0);
  });

  it("paused, app-wide ceiling or unavailable: a plain message, nothing stored", async () => {
    for (const reason of ["paused", "global_limit", "unavailable"]) {
      consume.mockResolvedValue({ allowed: false, reason });
      const result = await submitFeedback({ kind: "bug", message: "x" });
      expect(result.ok).toBe(false);
    }
    expect(db.count("feedback")).toBe(0);
  });
});
