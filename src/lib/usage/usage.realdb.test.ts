// The daily-limit function and its tables against REAL Postgres (PGlite): the
// actual migration file, Row Level Security, GRANTs, role switching. What the
// in-memory fake cannot show: that the limit holds under concurrency, that a
// signed-in user cannot read or reset their own counter, and that the function
// is not usable signed-out.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRealDb, readSql, type RealDb } from "@/test/realDb";

let real: RealDb;
const U1 = "00000000-0000-0000-0000-000000000001";
const U2 = "00000000-0000-0000-0000-000000000002";
const consume = (user: string | null, kind = "recommend", limit = 3) => real.clientFor(user).rpc("consume_usage", { p_kind: kind, p_limit: limit });
const row = async (res: ReturnType<typeof consume>) => ((await res).data as { allowed: boolean; used: number }[])[0];

beforeAll(async () => {
  real = await createRealDb({ sql: [readSql("supabase/migrations/2026-11-07_usage_and_events.sql")] });
  await real.addUser(U1);
  await real.addUser(U2);
});
afterAll(async () => real.db.close());

describe("consume_usage — the limit", () => {
  it("allows up to the limit, then refuses, and counts what it allowed", async () => {
    expect(await row(consume(U1))).toEqual({ allowed: true, used: 1 });
    expect(await row(consume(U1))).toEqual({ allowed: true, used: 2 });
    expect(await row(consume(U1))).toEqual({ allowed: true, used: 3 });
    expect(await row(consume(U1))).toEqual({ allowed: false, used: 3 });
    expect(await row(consume(U1))).toEqual({ allowed: false, used: 3 }); // refused calls don't count up
  });

  it("is per user and per kind", async () => {
    expect(await row(consume(U2))).toEqual({ allowed: true, used: 1 });
    expect(await row(consume(U1, "image", 3))).toEqual({ allowed: true, used: 1 });
  });

  it("holds under concurrency: 40 simultaneous calls against a limit of 10 allow exactly 10", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => consume(U2, "burst", 10)));
    const allowed = results.map((r) => (r.data as { allowed: boolean }[])[0].allowed).filter(Boolean).length;
    expect(allowed).toBe(10);
    const [stored] = await real.admin<{ count: number }>("select count from public.usage_counters where user_id = $1 and kind = 'burst'", [U2]);
    expect(stored.count).toBe(10);
  });

  it("a signed-out caller never gets an allowance", async () => {
    const res = await consume(null);
    const allowed = res.error ? false : (res.data as { allowed: boolean }[])[0]?.allowed;
    expect(allowed).toBe(false);
  });

  it("refuses nonsense: a zero limit, a malformed kind", async () => {
    expect((await row(consume(U1, "recommend", 0))).allowed).toBe(false);
    expect((await row(consume(U1, "Bad Kind!", 5))).allowed).toBe(false);
    expect((await row(consume(U1, "x".repeat(40), 5))).allowed).toBe(false);
  });
});

describe("usage_counters — a user can't touch their own allowance", () => {
  const as = (user: string) => real.clientFor(user);

  it("cannot read the table", async () => {
    expect((await as(U1).from("usage_counters").select("*")).error).not.toBeNull();
  });

  it("cannot reset, edit or insert a counter directly", async () => {
    expect((await as(U1).from("usage_counters").update({ count: 0 }).eq("user_id", U1)).error).not.toBeNull();
    expect((await as(U1).from("usage_counters").delete().eq("user_id", U1)).error).not.toBeNull();
    expect((await as(U1).from("usage_counters").insert({ user_id: U1, day: "2030-01-01", kind: "recommend", count: 0 })).error).not.toBeNull();
    // …and the counter is exactly where the function left it.
    expect(await row(consume(U1))).toEqual({ allowed: false, used: 3 });
  });
});

describe("product_events — own rows only, small, and from a fixed list of names", () => {
  const as = (user: string) => real.clientFor(user);

  it("a user can record and read their own events", async () => {
    expect((await as(U1).from("product_events").insert({ user_id: U1, name: "entry_selected", props: { entry: "sentence" } })).error).toBeNull();
    const res = await as(U1).from("product_events").select("name, props");
    expect(res.data).toEqual([{ name: "entry_selected", props: { entry: "sentence" } }]);
  });

  it("cannot write as someone else, read someone else's, or use an unlisted name", async () => {
    expect((await as(U1).from("product_events").insert({ user_id: U2, name: "entry_selected", props: {} })).error).not.toBeNull();
    expect((await as(U2).from("product_events").select("*")).data).toEqual([]);
    expect((await as(U1).from("product_events").insert({ user_id: U1, name: "typed_text", props: {} })).error).not.toBeNull();
  });

  it("props must be a small object — there is no room to put free text", async () => {
    expect((await as(U1).from("product_events").insert({ user_id: U1, name: "limit_hit", props: "a string" })).error).not.toBeNull();
    expect((await as(U1).from("product_events").insert({ user_id: U1, name: "limit_hit", props: { blob: "x".repeat(2000) } })).error).not.toBeNull();
  });

  it("the user can remove their own events (that is what Reset my data does)", async () => {
    expect((await as(U1).from("product_events").delete().eq("user_id", U1)).error).toBeNull();
    expect((await as(U1).from("product_events").select("*")).data).toEqual([]);
  });
});
