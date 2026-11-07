import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { USER_TABLES, wipeUserData } from "./accountData";

const root = join(__dirname, "../..");

describe("USER_TABLES is the complete list of user-owned tables", () => {
  // Reads the SQL itself, so a new table keyed to auth.users can't be added
  // without reset and delete learning about it.
  const sql = [join(root, "supabase/schema.sql"), ...readdirSync(join(root, "supabase/migrations")).map((f) => join(root, "supabase/migrations", f))]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const ownedInSql = [...sql.matchAll(/create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g)]
    .filter(([, , body]) => /references auth\.users \(id\)/.test(body))
    .map(([, name]) => name);

  it("covers every table that references auth.users", () => {
    expect(ownedInSql.length).toBeGreaterThanOrEqual(9);
    expect(USER_TABLES.map((t) => t.table).sort()).toEqual([...new Set(ownedInSql)].sort());
  });

  it("clears children before parents, and profiles last", () => {
    const names = USER_TABLES.map((t) => t.table);
    expect(names.at(-1)).toBe("profiles");
    expect(names.indexOf("meal_feedback")).toBeLessThan(names.indexOf("decision_sessions"));
  });

  it("every table cascades from auth.users (the database's own backstop)", () => {
    for (const { table } of USER_TABLES) {
      const body = new RegExp(`create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`).exec(sql)?.[1] ?? "";
      expect(body, table).toMatch(/references auth\.users \(id\) on delete cascade/);
    }
  });
});

describe("wipeUserData", () => {
  let db = createFakeDb();
  const client = (id = "u1") => db.clientFor(id) as unknown as SupabaseClient;
  const seedAll = (user: string) => {
    for (const { table, column } of USER_TABLES) db.seed(table, { [column]: user, marker: `${table}-${user}` });
  };

  beforeEach(() => {
    db = createFakeDb();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("removes this user's rows from every table and only theirs", async () => {
    seedAll("u1");
    seedAll("u2");
    const result = await wipeUserData(client(), "u1");
    expect(result).toMatchObject({ ok: true });
    for (const { table, column } of USER_TABLES) {
      expect(db.tables[table].filter((r) => r[column] === "u1")).toEqual([]);
      expect(db.tables[table].filter((r) => r[column] === "u2")).toHaveLength(1);
    }
  });

  it("is idempotent — a second run on an empty account succeeds", async () => {
    seedAll("u1");
    await wipeUserData(client(), "u1");
    expect(await wipeUserData(client(), "u1")).toMatchObject({ ok: true });
  });

  it("a table that doesn't exist in this database is skipped, not an error", async () => {
    seedAll("u1");
    db.failTable("saved_recipes", { code: "PGRST205", message: "Could not find the table" });
    const result = await wipeUserData(client(), "u1");
    expect(result).toMatchObject({ ok: true, skipped: ["saved_recipes"] });
    expect(db.tables.profiles).toEqual([]);
  });

  it("stops at the first real failure and says where; later tables are untouched", async () => {
    seedAll("u1");
    db.failTable("decision_sessions", { code: "42501", message: "permission denied" });
    const result = await wipeUserData(client(), "u1");
    expect(result).toMatchObject({ ok: false, failedAt: "decision_sessions" });
    expect(db.tables.profiles).toHaveLength(1); // profiles is last — still there, so a retry is possible
  });

  it("does not trust a delete that did nothing (RLS no-op): it re-reads and fails", async () => {
    seedAll("u1");
    db.swallowDeletesOn("profiles");
    expect(await wipeUserData(client(), "u1")).toMatchObject({ ok: false, failedAt: "profiles" });
  });

  it("a permissions refusal on a LEGACY table (unused by the app) doesn't fail the whole wipe", async () => {
    seedAll("u1");
    db.failTable("pantry_items", { code: "42501", message: "permission denied" });
    const result = await wipeUserData(client(), "u1");
    expect(result).toMatchObject({ ok: true, skipped: ["pantry_items"] });
    expect(db.tables.profiles).toEqual([]);
  });
});
