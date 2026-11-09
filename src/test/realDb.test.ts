import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRealDb, readSql, type RealDb } from "./realDb";

let real: RealDb;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

beforeAll(async () => {
  real = await createRealDb({ sql: [readSql("supabase/schema.sql")] });
  await real.addUser(A);
  await real.addUser(B);
});
afterAll(() => real.db.close());

describe("the real-database harness itself", () => {
  it("applies supabase/schema.sql, and applies it again (the file says it is re-runnable)", async () => {
    await real.db.exec(readSql("supabase/schema.sql"));
    const tables = await real.admin<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    expect(tables.map((t) => t.tablename)).toEqual(expect.arrayContaining(["saved_recipes", "saved_places", "decision_sessions", "place_feedback"]));
  });

  it("enforces RLS: a user sees and writes only their own rows", async () => {
    const own = await real.clientFor(A).from("saved_recipes").insert({ user_id: A, recipe_key: "k", recipe: { t: 1 } });
    expect(own.error).toBeNull();
    const asB = await real.clientFor(B).from("saved_recipes").select("*").eq("user_id", A);
    expect(asB.data).toEqual([]);
    const forged = await real.clientFor(B).from("saved_recipes").insert({ user_id: A, recipe_key: "k2", recipe: {} });
    expect(forged.error?.code).toBe("42501");
  });

  it("a signed-out request (role anon) is refused by Postgres itself", async () => {
    const res = await real.clientFor(null).from("saved_recipes").select("*");
    expect(res.error?.code).toBe("42501");
  });
});

describe("the migration files, each on its own", () => {
  it("2026-09-30_saved.sql and 2026-09-30_place_feedback.sql apply to a bare database, twice, and Saved works", async () => {
    const bare = await createRealDb({ sql: [readSql("supabase/migrations/2026-09-30_saved.sql"), readSql("supabase/migrations/2026-09-30_place_feedback.sql")] });
    try {
      await bare.db.exec(readSql("supabase/migrations/2026-09-30_saved.sql"));
      await bare.addUser(A);
      const saved = await bare.clientFor(A).from("saved_places").upsert({ user_id: A, provider: "google_places", place_id: "p", name: "n" }, { onConflict: "user_id,provider,place_id", ignoreDuplicates: true });
      expect(saved.error).toBeNull();
      const again = await bare.clientFor(A).from("saved_places").upsert({ user_id: A, provider: "google_places", place_id: "p", name: "n" }, { onConflict: "user_id,provider,place_id", ignoreDuplicates: true });
      expect(again.error).toBeNull();
      expect(await bare.admin("select 1 from public.saved_places")).toHaveLength(1);
    } finally {
      await bare.db.close();
    }
  });
});

describe("the generated-image cache (2026-10-02_recipe_images.sql)", () => {
  const KEY = "a".repeat(64);
  let db: RealDb;
  beforeAll(async () => {
    db = await createRealDb({ sql: [readSql("supabase/migrations/2026-10-02_recipe_images.sql")] });
    await db.addUser(A);
    await db.addUser(B);
  });
  afterAll(() => db.db.close());

  const server = () => db.clientFor("service_role");
  it("the server stores an entry; any signed-in user can read it; it is shared, and not user data", async () => {
    const add = await server().from("recipe_images").upsert({ cache_key: KEY, storage_path: `${KEY}.webp`, model: "gpt-image-2", prompt_version: 1, title: "Noodle Bowl" }, { onConflict: "cache_key", ignoreDuplicates: true });
    expect(add.error).toBeNull();
    const seenByB = await db.clientFor(B).from("recipe_images").select("storage_path").eq("cache_key", KEY).maybeSingle();
    expect(seenByB.data).toEqual({ storage_path: `${KEY}.webp` });
  });

  it("a signed-in user cannot write the cache at all: no insert, no pre-seeding, no update, no delete", async () => {
    const row = (cache_key: string) => ({ cache_key, storage_path: `${cache_key}.webp`, model: "evil", prompt_version: 1, title: "pre-seeded" });
    expect((await db.clientFor(A).from("recipe_images").insert(row("c".repeat(64)))).error?.code).toBe("42501");
    expect((await db.clientFor(B).from("recipe_images").upsert(row(KEY), { onConflict: "cache_key", ignoreDuplicates: true })).error?.code).toBe("42501");
    expect((await db.clientFor(B).from("recipe_images").update({ model: "evil" }).eq("cache_key", KEY)).error?.code).toBe("42501");
    expect((await db.clientFor(B).from("recipe_images").delete().eq("cache_key", KEY)).error?.code).toBe("42501");
    expect((await db.admin("select model from public.recipe_images"))[0]).toEqual({ model: "gpt-image-2" });
  });

  it("even the server can only store well-formed keys and paths", async () => {
    const row = (cache_key: string, storage_path: string) => ({ cache_key, storage_path, model: "m", prompt_version: 1, title: "t" });
    expect((await server().from("recipe_images").insert(row("not-a-hash", "not-a-hash.webp"))).error?.code).toBe("23514");
    expect((await server().from("recipe_images").insert(row("b".repeat(64), "../../etc/passwd"))).error?.code).toBe("23514");
  });

  it("the bucket is public-read; only the server may add files; the browser may add none", async () => {
    expect(await db.admin("select public, file_size_limit from storage.buckets where id = 'recipe-images'")).toEqual([{ public: true, file_size_limit: 1048576 }]);
    const asRole = async (role: "service_role" | "authenticated" | "anon", name: string) => {
      try {
        await db.db.transaction(async (tx) => {
          await tx.exec(`set local role ${role}`);
          await tx.query("insert into storage.objects (bucket_id, name) values ('recipe-images', $1)", [name]);
        });
        return "ok";
      } catch (e) {
        return (e as { code?: string }).code;
      }
    };
    expect(await asRole("service_role", `${KEY}.webp`)).toBe("ok");
    expect(await asRole("authenticated", `${"d".repeat(64)}.webp`)).toBe("42501"); // even a well-formed key name
    expect(await asRole("anon", `${"e".repeat(64)}.webp`)).toBe("42501");
  });

  it("is not in the list of user-owned tables: it has no user_id at all", async () => {
    const cols = await db.admin<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'recipe_images'");
    expect(cols.map((c) => c.column_name)).not.toContain("user_id");
  });
});
