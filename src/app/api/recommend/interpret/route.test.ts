// POST /api/recommend/interpret — the guard rails around the one model call:
// signed-in only, length-capped BEFORE any spend, every failure a short code,
// and the text never reaches a log line.

import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERPRET_MAX_CHARS } from "@/lib/interpret/schema";
import { createFakeDb } from "@/test/fakeSupabase";

let db = createFakeDb();
let currentUser: string | null = "user-1";
const read = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor(currentUser) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db.adminClient() }));
vi.mock("@/lib/interpret/read", () => ({ readSituation: (...args: unknown[]) => read(...args) }));

import { POST } from "./route";

const empty = { mode: null, hunger: null, minutes: null, effort: null, shopping: null, foods: [], extra_spend_usd: null, meal_budget: null, method: null, distance: null, craving: null, craving_category: null, snack_craving: null, ways: [], leave_to_us: null, after_exercise: null, protein_focus: null, meal_type: null, clear: [] };
const call = (body: unknown) => POST(new Request("http://localhost/api/recommend/interpret", { method: "POST", body: JSON.stringify(body) }));
const SECRET = "xylophone-casserole-7731";

let logged: unknown[][];
beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
  read.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  logged = [];
  for (const level of ["info", "warn", "error", "log"] as const) vi.spyOn(console, level).mockImplementation((...args) => void logged.push(args));
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/recommend/interpret — the daily allowance and events", () => {
  const events = () => (db.tables.product_events ?? []) as { name: string; props: Record<string, unknown> }[];

  it("past the limit: 429 limit_reached, and the model is not called", async () => {
    vi.stubEnv("USAGE_LIMIT_INTERPRET", "2");
    read.mockResolvedValue({ ...empty, mode: "cook" });
    expect((await call({ text: "one" })).status).toBe(200);
    expect((await call({ text: "two" })).status).toBe(200);
    const refused = await call({ text: "three" });
    expect(refused.status).toBe(429);
    expect((await refused.json()).error).toBe("limit_reached");
    expect(read).toHaveBeenCalledTimes(2);
    expect(events().filter((e) => e.name === "limit_hit")).toHaveLength(1);
  });

  it("a failing read still uses the allowance — retrying a broken read is not free", async () => {
    vi.stubEnv("USAGE_LIMIT_INTERPRET", "2");
    read.mockRejectedValue(new Error("down"));
    await call({ text: "one" });
    await call({ text: "two" });
    expect((await call({ text: "three" })).status).toBe(429);
  });

  it("invalid text spends nothing", async () => {
    await call({ text: "" });
    await call({ text: "a".repeat(INTERPRET_MAX_CHARS + 1) });
    expect(db.usageOf("user-1", "interpret")).toBe(0);
  });

  it("can't check the allowance (production): refuses and calls no model", async () => {
    vi.stubEnv("NODE_ENV", "production");
    db.failRpc({ code: "PGRST202", message: "no function" });
    expect((await call({ text: "very hungry" })).status).toBe(502);
    expect(read).not.toHaveBeenCalled();
  });

  it("records interpret_done: ok with the mode and a field count — and not one word of the text", async () => {
    read.mockResolvedValue({ ...empty, mode: "cook", craving: SECRET, foods: [SECRET, "rice"] });
    await call({ text: `I want ${SECRET}` });
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ name: "interpret_done", props: { ok: true, mode: "cook", fields: 3 } });
    expect(JSON.stringify(events())).not.toContain(SECRET);
  });

  it("records a failed read with its code", async () => {
    read.mockResolvedValue(empty);
    await call({ text: "asdf" });
    expect(events()[0]).toMatchObject({ name: "interpret_done", props: { ok: false, code: "nothing_found" } });
  });
});

describe("POST /api/recommend/interpret", () => {
  it("not signed in: 401, and the model is never called", async () => {
    currentUser = null;
    const res = await call({ text: "very hungry" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(read).not.toHaveBeenCalled();
  });

  it("empty or over-long text: 400 before any model spend", async () => {
    for (const text of ["", "   ", undefined, 5]) {
      const res = await call({ text });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("empty");
    }
    const long = await call({ text: "a".repeat(INTERPRET_MAX_CHARS + 1) });
    expect(long.status).toBe(400);
    expect((await long.json()).error).toBe("too_long");
    expect((await POST(new Request("http://localhost/x", { method: "POST", body: "not json" }))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });

  it("no API key: 503, no call", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await call({ text: "very hungry" })).status).toBe(503);
    expect(read).not.toHaveBeenCalled();
  });

  it("returns the record it was given — and passes the model only the trimmed text", async () => {
    read.mockResolvedValue({ ...empty, mode: "cook", hunger: "very_hungry", minutes: 20, foods: ["eggs", "rice"] });
    const res = await call({ text: "  Just   trained, very hungry, 20 minutes, I have eggs and rice. " });
    expect(res.status).toBe(200);
    expect((await res.json()).interpretation).toMatchObject({ mode: "cook", hunger: "very_hungry", minutes: 20, foods: ["eggs", "rice"] });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toBe("Just trained, very hungry, 20 minutes, I have eggs and rice.");
  });

  it("a read that found nothing is 422 'nothing_found' — a failed read, so the person keeps their text", async () => {
    read.mockResolvedValue(empty);
    const res = await call({ text: "asdf" });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("nothing_found");
  });

  it("a model failure is a short code, not the vendor's message", async () => {
    read.mockRejectedValue(new Error(`upstream said: ${SECRET}`));
    const res = await call({ text: "very hungry" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("a timeout is its own code", async () => {
    read.mockRejectedValue(new Anthropic.APIConnectionTimeoutError());
    const res = await call({ text: "very hungry" });
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBe("timeout");
  });

  it("the person's text — and what was read from it — never appears in a log line", async () => {
    read.mockResolvedValue({ ...empty, mode: "cook", craving: SECRET, foods: [SECRET] });
    await call({ text: `I want ${SECRET} tonight` });
    read.mockRejectedValue(new Error(SECRET));
    await call({ text: `I want ${SECRET} tonight` });
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain(SECRET);
  });
});

describe("POST /api/recommend/interpret — adjusting", () => {
  it("passes only the WAY of the request on screen to the reader; an invalid value is ignored", async () => {
    read.mockResolvedValue({ ...empty, mode: "cook" });
    const send = (body: unknown) => POST(new Request("http://localhost/api/recommend/interpret", { method: "POST", body: JSON.stringify(body) }));
    await send({ text: "cook instead", adjusting: "store_snack" });
    expect(read.mock.calls[0][3]).toBe("store_snack");
    await send({ text: "cook instead", adjusting: "<script>" });
    expect(read.mock.calls[1][3]).toBeNull();
    await send({ text: "cook instead" });
    expect(read.mock.calls[2][3]).toBeNull();
  });
});
