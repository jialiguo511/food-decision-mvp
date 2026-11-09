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
import { afterAll, describe, expect, it, vi } from "vitest";

// Booting a Postgres and applying the whole schema (twice) takes a few seconds —
// more when the full suite runs in parallel. A timeout is not a failure of the SQL.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
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

describe("deleting an account that owns shared Storage files", () => {
  const U = "00000000-0000-0000-0000-0000000000aa";
  const setup = async () => {
    const db = await fresh([SCHEMA]);
    await db.addUser(U);
    // A generated recipe picture, uploaded under this user's own session.
    await db.admin("insert into storage.objects (bucket_id, name, owner, owner_id) values ('recipe-images', 'abc.webp', $1::uuid, $1::text)", [U]);
    return db;
  };

  it("the failure is real: Supabase's own foreign key refuses to delete a user who owns a file", async () => {
    const db = await setup();
    await expect(db.admin("delete from auth.users where id = $1", [U])).rejects.toThrow(/storage\.objects|objects_owner|violates foreign key/i);
  });

  it("releasing first fixes it — and the shared picture itself stays", async () => {
    const db = await setup();
    const [released] = await db.admin<{ n: number }>("select public.release_user_storage($1) as n", [U]);
    expect(released.n).toBe(1);
    await db.admin("delete from auth.users where id = $1", [U]); // no longer blocked
    const files = await db.admin<{ name: string; owner: string | null; owner_id: string | null }>("select name, owner, owner_id from storage.objects");
    expect(files).toEqual([{ name: "abc.webp", owner: null, owner_id: null }]);
  });

  it("only the server's service role may call it — not a signed-in user, not anonymous", async () => {
    const db = await setup();
    for (const role of ["authenticated", "anon"]) {
      await expect(db.db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); await tx.query("select public.release_user_storage($1)", [U]); })).rejects.toThrow(/permission denied/i);
    }
    await db.db.transaction(async (tx) => { await tx.exec("set local role service_role"); await tx.query("select public.release_user_storage($1)", [U]); });
  });

  it("a user who owns nothing is untouched; someone else's files are not released", async () => {
    const db = await setup();
    const OTHER = "00000000-0000-0000-0000-0000000000bb";
    await db.addUser(OTHER);
    const [none] = await db.admin<{ n: number }>("select public.release_user_storage($1) as n", [OTHER]);
    expect(none.n).toBe(0);
    const [stillOwned] = await db.admin<{ owner: string }>("select owner from storage.objects");
    expect(stillOwned.owner).toBe(U);
  });
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
    expect(gaps.sort()).toEqual(
      ["function consume_usage(uuid, text, integer, integer)", "consume_usage is NOT callable by the browser (anon/authenticated)", "function release_user_storage", "table product_events", "table usage_counters", "table global_usage", "table app_flags", "table feedback"].sort(),
    );
  });

  it("a database that stopped at the previous web-beta migration is told the cost guards and the feedback table are missing — and is fixed by the new migration alone", async () => {
    const previous = await fresh([SCHEMA.slice(0, SCHEMA.indexOf("-- Web beta: per-user daily usage limits")), readSql("supabase/migrations/2026-11-07_usage_and_events.sql"), readSql("supabase/migrations/2026-11-08_release_user_storage.sql")]);
    expect((await missing(previous)).sort()).toEqual(
      ["function consume_usage(uuid, text, integer, integer)", "consume_usage is NOT callable by the browser (anon/authenticated)", "table app_flags", "table feedback", "table global_usage"].sort(),
    );
    for (const file of ["2026-11-09_abuse_guards_and_feedback.sql", "2026-11-10_server_only_writes.sql"]) await previous.db.exec(readSql(`supabase/migrations/${file}`));
    expect(await missing(previous)).toEqual([]);
    // …and running them a second time, in any order, is harmless — and never re-opens what 2026-11-10 closed.
    for (const file of ["2026-11-10_server_only_writes.sql", "2026-11-09_abuse_guards_and_feedback.sql", "2026-11-07_usage_and_events.sql", "2026-10-02_recipe_images.sql"]) await previous.db.exec(readSql(`supabase/migrations/${file}`));
    expect(await missing(previous)).toEqual([]);
  });
});
