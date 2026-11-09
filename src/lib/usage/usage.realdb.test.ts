// The daily-limit function and its tables against REAL Postgres (PGlite): the
// actual migration file, Row Level Security, GRANTs, role switching. What the
// in-memory fake cannot show: that the limit holds under concurrency, that a
// signed-in user cannot read or reset their own counter, and that the function
// is not usable signed-out.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRealDb, readSql, SERVICE_ROLE, type RealDb } from "@/test/realDb";

let real: RealDb;
const U1 = "00000000-0000-0000-0000-000000000001";
const U2 = "00000000-0000-0000-0000-000000000002";
// The server's call: service role, user id from the verified session, limits from its own configuration.
const consume = (user: string | null, kind = "recommend", limit = 3, global: number | null = null) =>
  real.clientFor(SERVICE_ROLE).rpc("consume_usage", { p_user: user, p_kind: kind, p_limit: limit, p_global_limit: global });
// {allowed, used} only: refused_by is asserted where it matters.
const row = async (res: ReturnType<typeof consume>) => {
  const r = ((await res).data as { allowed: boolean; used: number }[])[0];
  return { allowed: r.allowed, used: r.used };
};

beforeAll(async () => {
  real = await createRealDb({ sql: [readSql("supabase/migrations/2026-10-02_recipe_images.sql"), readSql("supabase/migrations/2026-11-07_usage_and_events.sql"), readSql("supabase/migrations/2026-11-09_abuse_guards_and_feedback.sql"), readSql("supabase/migrations/2026-11-10_server_only_writes.sql")] });
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

describe("consume_usage — the whole app's daily ceiling and the owner's off switch", () => {
  const U3 = "00000000-0000-0000-0000-000000000003";
  const U4 = "00000000-0000-0000-0000-000000000004";
  const refusedBy = async (res: ReturnType<typeof consume>) => ((await res).data as { refused_by: string | null }[])[0].refused_by;
  const globalCount = async (kind: string) => (await real.admin<{ count: number }>("select count from public.global_usage where kind = $1", [kind]))[0]?.count ?? 0;
  beforeAll(async () => {
    await real.addUser(U3);
    await real.addUser(U4);
  });

  it("many accounts together cannot pass the app-wide ceiling, whatever each one's own limit is", async () => {
    // Four people, each allowed 10, but the whole app only 5 today.
    const outcomes = [];
    for (const u of [U1, U2, U3, U4, U1, U2, U3, U4]) outcomes.push((await consume(u, "wide", 10, 5)).data as { allowed: boolean; refused_by: string | null }[]);
    expect(outcomes.filter((o) => o[0].allowed).length).toBe(5);
    expect(outcomes.filter((o) => !o[0].allowed).every((o) => o[0].refused_by === "global")).toBe(true);
    expect(await globalCount("wide")).toBe(5);
  });

  it("a refusal by the app ceiling gives the person's unit back — they were not charged for a call that never happened", async () => {
    const [stored] = await real.admin<{ n: number }>("select coalesce(sum(count), 0)::int as n from public.usage_counters where kind = 'wide'");
    expect(stored.n).toBe(5); // 5 allowed calls, not 8
  });

  it("holds under concurrency: 60 simultaneous calls from 4 accounts against a ceiling of 12 allow exactly 12", async () => {
    const users = [U1, U2, U3, U4];
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => consume(users[i % 4], "stampede", 30, 12)));
    expect(results.map((r) => (r.data as { allowed: boolean }[])[0].allowed).filter(Boolean).length).toBe(12);
    expect(await globalCount("stampede")).toBe(12);
  });

  it("a person over their OWN limit is told so (not blamed on the app) and never touches the app counter", async () => {
    await consume(U3, "own", 1, 100);
    const second = consume(U3, "own", 1, 100);
    expect(await refusedBy(second)).toBe("user");
    expect(await globalCount("own")).toBe(1);
  });

  it("the off switch: app_flags.paused_kinds stops the named kinds at once — and 'all' stops everything — without a deploy", async () => {
    expect(await refusedBy(consume(U1, "switch", 9, 9))).toBeNull();
    await real.admin("update public.app_flags set value = 'switch, other' where key = 'paused_kinds'");
    expect(await refusedBy(consume(U1, "switch", 9, 9))).toBe("paused");
    expect(await refusedBy(consume(U1, "unrelated", 9, 9))).toBeNull();
    await real.admin("update public.app_flags set value = 'ALL' where key = 'paused_kinds'");
    expect(await refusedBy(consume(U1, "unrelated", 9, 9))).toBe("paused");
    // Paused calls are not counted against anyone.
    const [c] = await real.admin<{ n: number }>("select count(*)::int as n from public.usage_counters where kind = 'switch' and user_id = $1", [U1]);
    expect(c.n).toBe(1);
    await real.admin("update public.app_flags set value = '' where key = 'paused_kinds'");
    expect(await refusedBy(consume(U1, "switch", 9, 9))).toBeNull();
  });

  it("a signed-in user cannot read or change the app counters or the switchboard", async () => {
    const as = real.clientFor(U1);
    expect((await as.from("global_usage").select("*")).error).not.toBeNull();
    expect((await as.from("global_usage").update({ count: 0 }).eq("kind", "wide")).error).not.toBeNull();
    expect((await as.from("app_flags").select("*")).error).not.toBeNull();
    expect((await as.from("app_flags").update({ value: "" }).eq("key", "paused_kinds")).error).not.toBeNull();
    expect((await real.clientFor(null).from("app_flags").select("*")).error).not.toBeNull();
  });

  it("a nonsense ceiling is refused as invalid, not treated as 'no ceiling'", async () => {
    expect(await refusedBy(consume(U1, "bad", 5, 0))).toBe("invalid");
    expect(await refusedBy(consume(U1, "bad", 5, -3))).toBe("invalid");
  });

});

describe("consume_usage — a browser cannot call it at all", () => {
  const args = { p_user: U1, p_kind: "recommend", p_limit: 1_000_000, p_global_limit: 1_000_000 };
  it("a signed-in user cannot pick their own limits, spend for someone else, or push the app counter", async () => {
    for (const actor of [U1, U2]) {
      const res = await real.clientFor(actor).rpc("consume_usage", args);
      expect(res.error, `as ${actor}`).not.toBeNull();
    }
    const [c] = await real.admin<{ n: number }>("select count(*)::int as n from public.usage_counters where kind = 'recommend' and count > 100");
    expect(c.n).toBe(0);
  });
  it("a signed-out caller cannot either", async () => {
    expect((await real.clientFor(null).rpc("consume_usage", args)).error).not.toBeNull();
  });
  it("the old signatures (kind, limit) and (kind, limit, ceiling) are gone, not merely hidden", async () => {
    const fns = await real.admin<{ args: string }>("select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'consume_usage'");
    expect(fns.map((f) => f.args)).toEqual(["p_user uuid, p_kind text, p_limit integer, p_global_limit integer"]);
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
