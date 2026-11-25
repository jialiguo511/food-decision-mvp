// The bundled iOS app's API (/api/app/*) with TWO accounts, against REAL Postgres running the shipped
// schema.sql with Row Level Security: through the actual route handlers, the write allowlist and the
// existing Server Actions. Each request carries one user's bearer token; the session lookup maps it
// to that user (in production `createClient()` checks the token with Supabase).
//
// Can B read or change A's Saved items, choices or profile through the app endpoints? Can a request
// with no token, an unknown action, malformed arguments or a foreign origin do anything?

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRecommendations } from "@/lib/recommend/output";
import { createRealDb, readSql, type RealDb } from "@/test/realDb";
import { recipe } from "@/test/savedFixtures";
import type { CookConstraints } from "@/lib/types";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const A = "aaaaaaaa-1111-4111-8111-11111111111a";
const B = "bbbbbbbb-2222-4222-8222-22222222222b";
const TOKENS: Record<string, string> = { "token-of-a-0123456789.x.y": A, "token-of-b-0123456789.x.y": B };

let real: RealDb;
/** The bearer token of the request being handled (what next/headers would return). */
let bearer: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => real.clientFor(bearer ? (TOKENS[bearer] ?? null) : null),
  getUser: async () => (bearer && TOKENS[bearer] ? { id: TOKENS[bearer] } : null),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => null }));
vi.mock("@/lib/env", async (orig) => ({ ...(await orig<object>()), isSupabaseConfigured: true }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { POST as action } from "./actions/[name]/route";
import { GET as savedGet } from "./saved/route";
import { GET as profileGet } from "./profile/route";

const CONSTRAINTS: CookConstraints = {
  decision_mode: "cook", max_minutes: 60, budget_usd: 50, budget_source: "override", equipment: ["Stovetop"],
  equipment_known: true, no_cooking: false, no_shopping: false, allergies: [], dietary: { patterns: [], other: null },
};
function recipes() {
  const f = (title: string) => {
    const { decision_mode: _m, role: _r, ...rest } = recipe({ title, equipment: ["Stovetop"], steps: [`Cook the ${title}.`] });
    void _m;
    void _r;
    return rest;
  };
  const parsed = parseRecommendations(JSON.stringify({ best_match: f("Rice Bowl"), lowest_effort: f("Toast"), alternative: f("Noodles") }), CONSTRAINTS);
  if (!parsed.ok) throw new Error(parsed.details.join("; "));
  return parsed.recommendations;
}

const APP = "capacitor://localhost";
async function call(as: string | null, name: string, args: unknown[], origin = APP) {
  bearer = as;
  const headers: Record<string, string> = { "content-type": "application/json", host: "api.example", origin };
  if (as) headers.authorization = `Bearer ${as}`;
  const res = await action(new Request(`https://api.example/api/app/actions/${name}`, { method: "POST", headers, body: JSON.stringify({ args }) }), {
    params: Promise.resolve({ name }),
  });
  return { status: res.status, body: (await res.json()) as { result?: { ok?: boolean; error?: string }; error?: { code: string } } };
}
async function read(as: string | null, get: (r: Request) => Response | Promise<Response>, url: string) {
  bearer = as;
  const res = await get(new Request(url));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const tokenOf = (user: string) => Object.keys(TOKENS).find((t) => TOKENS[t] === user)!;

let sessionOfA = "";
beforeAll(async () => {
  real = await createRealDb({ sql: [readSql("supabase/schema.sql")] });
  await real.addUser(A);
  await real.addUser(B);
});
afterAll(() => real.db.close());
beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  for (const t of ["saved_recipes", "decision_sessions", "profiles"]) await real.admin(`delete from public.${t}`);
  const { data } = await real.clientFor(A).from("decision_sessions").insert({ user_id: A, context: {}, recommendations: recipes() }).select("id").single();
  sessionOfA = (data as { id: string }).id;
});

describe("app API — authorized", () => {
  it("A saves from A's session and reads it back in Saved", async () => {
    const saved = await call(tokenOf(A), "saveFromSession", [sessionOfA, 0]);
    expect(saved.status).toBe(200);
    expect(saved.body.result?.ok).toBe(true);
    const list = await read(tokenOf(A), savedGet, "https://api.example/api/app/saved?tab=recipes");
    expect(list.status).toBe(200);
    expect((list.body.recipes as unknown[]).length).toBe(1);
  });

  it("A records a choice on A's session", async () => {
    const chosen = await call(tokenOf(A), "chooseRecommendation", [sessionOfA, 1]);
    expect(chosen.body.result).toMatchObject({ ok: true, chosenIndex: 1 });
  });
});

describe("app API — B against A's data", () => {
  it("B can't save from, choose on, or see A's session", async () => {
    expect((await call(tokenOf(B), "saveFromSession", [sessionOfA, 0])).body.result?.ok).toBe(false);
    expect((await call(tokenOf(B), "chooseRecommendation", [sessionOfA, 2])).body.result?.ok).toBe(false);
    const rows = await real.admin<{ chosen_index: number | null }>("select chosen_index from public.decision_sessions where id = $1", [sessionOfA]);
    expect(rows[0].chosen_index).toBeNull();
    expect(await real.admin("select * from public.saved_recipes where user_id = $1", [B])).toEqual([]);
  });

  it("B can't remove A's saved recipe, and B's Saved shows none of A's", async () => {
    await call(tokenOf(A), "saveFromSession", [sessionOfA, 0]);
    const [{ id }] = await real.admin<{ id: string }>("select id from public.saved_recipes where user_id = $1", [A]);
    await call(tokenOf(B), "removeSaved", ["recipe", id]);
    expect(await real.admin("select id from public.saved_recipes where id = $1", [id])).toHaveLength(1);
    const bList = await read(tokenOf(B), savedGet, "https://api.example/api/app/saved?tab=recipes");
    expect(bList.body.recipes).toEqual([]);
  });

  it("B's profile write and read touch only B", async () => {
    await real.admin("insert into public.profiles (id, display_name) values ($1, 'A-private')", [A]);
    const before = await real.admin("select * from public.profiles where id = $1", [A]);
    await call(tokenOf(B), "confirmNoAllergies", []);
    expect(await real.admin("select * from public.profiles where id = $1", [A])).toEqual(before);
    const me = await read(tokenOf(B), profileGet, "https://api.example/api/app/profile");
    expect(JSON.stringify(me.body)).not.toContain("A-private");
  });
});

describe("app API — unauthorized and malformed", () => {
  it("no token: reads are 401, writes do nothing", async () => {
    expect((await read(null, savedGet, "https://api.example/api/app/saved")).status).toBe(401);
    expect((await read(null, profileGet, "https://api.example/api/app/profile")).status).toBe(401);
    const res = await call(null, "chooseRecommendation", [sessionOfA, 0], "https://api.example");
    expect(res.body.result?.ok).toBe(false);
  });

  it("unknown action, prototype names and bad arguments are refused before anything runs", async () => {
    expect((await call(tokenOf(A), "eval", [])).status).toBe(404);
    expect((await call(tokenOf(A), "constructor", [])).status).toBe(404);
    expect((await call(tokenOf(A), "__proto__", [])).status).toBe(404);
    expect((await call(tokenOf(A), "chooseRecommendation", [sessionOfA, "1"])).status).toBe(400);
    expect((await call(tokenOf(A), "removeSaved", ["profiles", "x"])).status).toBe(400);
  });

  it("a cross-site browser request is refused (403), even with a token", async () => {
    expect((await call(tokenOf(A), "chooseRecommendation", [sessionOfA, 0], "https://evil.example")).status).toBe(403);
    const rows = await real.admin<{ chosen_index: number | null }>("select chosen_index from public.decision_sessions where id = $1", [sessionOfA]);
    expect(rows[0].chosen_index).toBeNull();
  });
});
