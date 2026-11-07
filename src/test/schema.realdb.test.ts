// The deployment SQL, run for real. supabase/schema.sql says "safe to re-run";
// each file in supabase/migrations says the same. A release note that tells
// someone to paste these into a production database should be backed by more
// than a comment, so this applies them to an empty Postgres (PGlite) the way an
// operator would and checks the claims:
//
//   * schema.sql applies cleanly, and a second time on top of itself;
//   * every migration applies cleanly on a database that already has schema.sql
//     (so running one "just in case" can't break anything);
//   * the read-only check (supabase/check-schema.sql) finds nothing MISSING
//     afterwards, and finds the pieces missing on an empty database — so the
//     check can actually tell the difference.
//
// What this can't prove: that YOUR project's existing tables are in the shape
// schema.sql expects. That's what check-schema.sql is for, run in the Supabase
// SQL editor.

import { readdirSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createRealDb, readSql, type RealDb } from "./realDb";

const MIGRATIONS = readdirSync(new URL("../../supabase/migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
const SCHEMA = readSql("supabase/schema.sql");
const CHECK = readSql("supabase/check-schema.sql");

const open: RealDb[] = [];
afterAll(async () => {
  for (const db of open) await db.db.close();
});
const fresh = async (sql: string[] = []) => {
  const db = await createRealDb({ sql });
  open.push(db);
  return db;
};
const missing = async (db: RealDb) => (await db.admin<{ item: string; status: string }>(CHECK)).filter((r) => r.status !== "ok").map((r) => r.item);

describe("supabase/schema.sql", () => {
  it("applies to an empty database, and again on top of itself", async () => {
    const db = await fresh([SCHEMA, SCHEMA]);
    expect(await missing(db)).toEqual([]);
  });

  it("is what a brand-new project needs: everything the app reads and writes exists afterwards", async () => {
    const db = await fresh([SCHEMA]);
    const tables = (await db.admin<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'")).map((r) => r.tablename);
    for (const t of ["profiles", "kitchen_staples", "decision_sessions", "meal_feedback", "place_feedback", "saved_recipes", "saved_places", "recipe_images", "usage_counters", "product_events"]) {
      expect(tables, t).toContain(t);
    }
  });
});

describe("each migration is safe to run on a database that already has the schema", () => {
  for (const file of MIGRATIONS) {
    it(file, async () => {
      const db = await fresh([SCHEMA, readSql(`supabase/migrations/${file}`), readSql(`supabase/migrations/${file}`)]);
      expect(await missing(db)).toEqual([]);
    });
  }
});

describe("supabase/metrics.sql", () => {
  it("every query runs against the real schema (an empty database simply returns no rows)", async () => {
    const db = await fresh([SCHEMA]);
    await db.db.exec(readSql("supabase/metrics.sql"));
  });
});

describe("supabase/check-schema.sql", () => {
  it("says what is missing on an empty database — including the web-beta pieces — and ok when nothing is", async () => {
    const empty = await fresh();
    const gaps = await missing(empty);
    for (const needle of ["table profiles", "table decision_sessions", "table usage_counters", "table product_events", "function consume_usage"]) {
      expect(gaps.some((g) => g.includes(needle)), needle).toBe(true);
    }
  });

  it("a database that stops at the last release (everything but the web-beta migration) is told exactly that", async () => {
    const before = await fresh([SCHEMA.slice(0, SCHEMA.indexOf("-- Web beta: per-user daily usage limits"))]);
    const gaps = await missing(before);
    expect(gaps.sort()).toEqual(["function consume_usage", "table product_events", "table usage_counters"].sort());
  });
});
