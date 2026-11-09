// Two accounts, one real Postgres (PGlite) running the project's actual schema.sql:
// can user B read, change, delete or forge anything of user A's? Row Level Security,
// table GRANTs and function privileges are exercised for real, as the `authenticated`
// and `anon` roles — not a fake that applies no rules.
//
// Scope, stated plainly: this proves the DATABASE layer of the shipped SQL, on a local
// engine that stubs Supabase's auth schema and PostgREST. It does not prove that a
// particular Supabase project was set up from this file (supabase/check-schema.sql does
// that, in the SQL editor) and it does not test the Next.js routes (their ownership
// checks are tested separately). Every table in USER_TABLES must have a fixture below,
// so adding a user-owned table without testing its isolation fails here.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { USER_TABLES } from "@/lib/accountData";
import { createRealDb, readSql, type RealDb } from "./realDb";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const A = "aaaaaaaa-0000-0000-0000-00000000000a";
const B = "bbbbbbbb-0000-0000-0000-00000000000b";

let real: RealDb;
beforeAll(async () => {
  real = await createRealDb({ sql: [readSql("supabase/schema.sql")] });
  await real.addUser(A);
  await real.addUser(B);
});
afterAll(async () => real.db.close());

/** One valid row for a user, per table. `pantry_items` is a legacy table that a fresh database
 *  deliberately gives no policy and no grant (schema.sql), so it is checked as "closed" instead. */
const fixtures: Record<string, (user: string) => Record<string, unknown>> = {
  profiles: (u) => ({ id: u, display_name: "private-name-of-A" }),
  kitchen_staples: (u) => ({ user_id: u, name: "soy sauce" }),
  recipes: (u) => ({ user_id: u, title: "private recipe" }),
  decision_sessions: (u) => ({ user_id: u, context: { craving_note: "private craving" }, recommendations: [] }),
  meal_feedback: (u) => ({ user_id: u, meal_title: "private meal", did_eat: true, note: "private note" }),
  place_feedback: (u) => ({ user_id: u, place_id: "p-1", action: "exclude", reason: "dont_like" }),
  saved_recipes: (u) => ({ user_id: u, recipe_key: "k1", recipe: { title: "private" } }),
  saved_places: (u) => ({ user_id: u, place_id: "p-1", name: "Private Place" }),
  product_events: (u) => ({ user_id: u, name: "limit_hit", props: { kind: "image" } }),
  feedback: (u) => ({ user_id: u, kind: "bug", message: "private message", contact: "a@example.com" }),
};
const owned = USER_TABLES.filter((t) => t.table !== "pantry_items");
const ownerCol = (table: string) => USER_TABLES.find((t) => t.table === table)!.column;

describe("every user-owned table has an isolation fixture", () => {
  it("USER_TABLES and this test agree (a new table without a test fails here)", () => {
    expect(owned.map((t) => t.table).sort()).toEqual(Object.keys(fixtures).sort());
  });
});

describe.each(owned.map((t) => t.table))("%s — user B against user A's row", (table) => {
  const col = ownerCol(table);
  const as = (user: string | null) => real.clientFor(user);

  beforeAll(async () => {
    const res = await as(A).from(table).insert(fixtures[table](A));
    expect(res.error, `A can write own ${table}`).toBeNull();
  });

  it("A reads their own row", async () => {
    const res = await as(A).from(table).select("*").eq(col, A);
    expect((res.data as unknown[]).length).toBe(1);
  });

  it("B sees nothing of A's, even asking for A's id directly", async () => {
    expect((await as(B).from(table).select("*")).data).toEqual([]);
    expect((await as(B).from(table).select("*").eq(col, A)).data).toEqual([]);
  });

  it("B cannot edit or delete A's row (it matches zero rows), and A's row is untouched afterwards", async () => {
    const edit = fixtures[table](A);
    const changed = await as(B).from(table).update(Object.fromEntries(Object.entries(edit).filter(([k]) => k !== col && k !== "id").slice(0, 1).map(([k]) => [k, k === "kind" ? "idea" : k === "name" ? "hijacked" : null]))).eq(col, A).select("*");
    // Either rejected outright or matched nothing — never a row changed.
    expect(changed.error ? [] : (changed.data as unknown[])).toEqual([]);
    const del = await as(B).from(table).delete().eq(col, A).select("*");
    expect(del.error ? [] : (del.data as unknown[])).toEqual([]);
    const still = await real.admin<Record<string, unknown>>(`select * from public.${table} where ${col} = $1`, [A]);
    expect(still.length).toBe(1);
  });

  it("B cannot write a row in A's name", async () => {
    const res = await as(B).from(table).insert(table === "profiles" ? { id: A } : { ...fixtures[table](A), ...(table === "saved_recipes" ? { recipe_key: "k2" } : table === "saved_places" || table === "place_feedback" ? { place_id: "p-2" } : {}) });
    expect(res.error).not.toBeNull();
  });

  it("a signed-out request (role anon) can neither read nor write it", async () => {
    expect((await as(null).from(table).select("*")).error).not.toBeNull();
    expect((await as(null).from(table).insert(fixtures[table](A))).error).not.toBeNull();
  });
});

describe("the legacy pantry_items table is closed on a fresh database", () => {
  it("nobody signed in can read or write it", async () => {
    expect((await real.clientFor(A).from("pantry_items").select("*")).error).not.toBeNull();
    expect((await real.clientFor(A).from("pantry_items").insert({ user_id: A, name: "x" })).error).not.toBeNull();
  });
});

describe("a session id is not a key to someone else's feedback", () => {
  it("B cannot read A's feedback by the session it hangs off, nor attach feedback to A's session as a row of their own", async () => {
    const created = await real.clientFor(A).from("decision_sessions").insert({ user_id: A, context: {}, recommendations: [] }).select("id").single();
    const sessionId = (created.data as { id: string }).id;
    await real.clientFor(A).from("meal_feedback").insert({ user_id: A, session_id: sessionId, meal_title: "m", did_eat: false });
    expect((await real.clientFor(B).from("meal_feedback").select("*").eq("session_id", sessionId)).data).toEqual([]);
    expect((await real.clientFor(B).from("decision_sessions").select("*").eq("id", sessionId)).data).toEqual([]);
    expect((await real.clientFor(B).from("decision_sessions").update({ chosen_index: 1 }).eq("id", sessionId).select("*")).data ?? []).toEqual([]);
  });
});

describe("private functions and counters", () => {
  it("B cannot run the service-role-only storage release, on A or anyone", async () => {
    const res = await real.clientFor(B).rpc("release_user_storage", { p_user: A });
    expect(res.error).not.toBeNull();
    expect((await real.clientFor(null).rpc("release_user_storage", { p_user: A })).error).not.toBeNull();
  });

  it("consume_usage cannot be called by a user at all — not for themselves, not for someone else", async () => {
    for (const actor of [A, B, null]) {
      const res = await real.clientFor(actor).rpc("consume_usage", { p_user: A, p_kind: "recommend", p_limit: 5, p_global_limit: 100 });
      expect(res.error, String(actor)).not.toBeNull();
    }
    expect(await real.admin("select * from public.usage_counters")).toEqual([]);
  });

  it("usage and cost tables are invisible to users", async () => {
    for (const table of ["usage_counters", "global_usage", "app_flags"]) {
      expect((await real.clientFor(B).from(table).select("*")).error, table).not.toBeNull();
    }
  });
});

describe("the shared picture cache holds no private data and cannot be overwritten", () => {
  it("a signed-in user can read the cache but cannot add, edit or delete a row — only the server writes", async () => {
    const key = "a".repeat(64);
    // The server (service role) stores one.
    expect((await real.clientFor("service_role").from("recipe_images").insert({ cache_key: key, storage_path: `${key}.webp`, model: "m", prompt_version: 1, title: "Lemon rice" })).error).toBeNull();
    expect((await real.clientFor(B).from("recipe_images").select("cache_key").eq("cache_key", key)).data).toEqual([{ cache_key: key }]);
    // A user cannot pre-seed a picture for another dish, nor deface or remove one.
    const other = "b".repeat(64);
    expect((await real.clientFor(A).from("recipe_images").insert({ cache_key: other, storage_path: `${other}.webp`, model: "m", prompt_version: 1, title: "Pre-seeded" })).error).not.toBeNull();
    expect((await real.clientFor(B).from("recipe_images").update({ title: "defaced" }).eq("cache_key", key)).error).not.toBeNull();
    expect((await real.clientFor(B).from("recipe_images").delete().eq("cache_key", key)).error).not.toBeNull();
    expect((await real.clientFor(null).from("recipe_images").select("*")).error).not.toBeNull();
  });

  it("the table has no user_id and no free-text column beyond the dish title, so it cannot carry anyone's private input", async () => {
    const cols = await real.admin<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'recipe_images' order by 1");
    expect(cols.map((c) => c.column_name)).toEqual(["cache_key", "created_at", "model", "prompt_version", "storage_path", "title"]);
  });

  it("Storage: the browser can only read pictures — no insert, update or delete policy for it", async () => {
    const policies = await real.admin<{ cmd: string; policyname: string }>("select cmd, policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1, 2");
    expect(policies.map((p) => p.cmd)).toEqual(["SELECT"]);
  });
});
