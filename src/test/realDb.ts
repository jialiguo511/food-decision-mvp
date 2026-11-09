// A REAL Postgres (PGlite, in-process WASM) with the project's actual schema,
// for tests that must prove persistence works rather than assume it — the
// in-memory fake (fakeSupabase.ts) applies no RLS, no grants, no constraints,
// and no missing tables, which is exactly where "Save" can fail.
//
// What is real: the SQL in supabase/schema.sql (or a migration file), Row Level
// Security, GRANTs, unique / FK / check constraints, jsonb, ON CONFLICT. Every
// query below runs as the `authenticated` role with auth.uid() set to the given
// user — the same conditions PostgREST gives a signed-in request.
// What is stubbed: Supabase's `auth` schema (a users table and auth.uid()), and
// PostgREST itself — `clientFor` is a small query builder covering the calls the
// app makes (select / eq / in / is / order / limit / maybeSingle / single /
// insert / upsert / update / delete), translating Postgres errors to the codes
// PostgREST reports (a missing table is PGRST205, not 42P01).

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

type Row = Record<string, unknown>;
type DbError = { code: string; message: string; details: string | null; hint: string | null };
type Result = { data: unknown; error: DbError | null; count?: number | null };
/** Who a statement runs as: a signed-in user id, null (signed out → anon), or the server's service role. */
export type Actor = string | null | "service_role";
export const SERVICE_ROLE = "service_role" as const;

const AUTH_STUB = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;
  -- Supabase's service_role bypasses Row Level Security (it is what the server's admin client uses).
  alter role service_role bypassrls;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant select on auth.users to authenticated;

  -- Supabase Storage's two tables, as far as policies and migrations touch them.
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  -- As in Supabase: the owner is a foreign key to auth.users with NO cascade, so a user who owns an object cannot be deleted.
  create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid references auth.users (id), owner_id text, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated, anon;
  grant select, insert on storage.objects to authenticated;
  grant select on storage.objects to anon;
`;

export const readSql = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

export async function createRealDb(options: { sql?: string[] } = {}) {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const sql of options.sql ?? []) await db.exec(sql);
  // As Supabase's default privileges give it: the service role can use whatever exists.
  await db.exec(`
    grant usage on schema public, storage to service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant all on all tables in schema storage to service_role;
  `);

  const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;
  const toError = (e: unknown): DbError => {
    const err = e as { code?: string; message?: string; detail?: string; hint?: string };
    // PostgREST reports these through its own codes, not Postgres's.
    const code = err.code === "42P01" ? "PGRST205" : err.code === "42703" ? "PGRST204" : (err.code ?? "XX000");
    return { code, message: err.message ?? String(e), details: err.detail ?? null, hint: err.hint ?? null };
  };
  const param = (v: unknown) => (v !== null && typeof v === "object" ? JSON.stringify(v) : v);

  /** Runs one statement as `userId` (null = no JWT, i.e. role anon; "service_role" = the server's key). */
  async function asUser(userId: Actor, sql: string, params: unknown[]): Promise<Result> {
    try {
      const out = await db.transaction(async (tx) => {
        const service = userId === SERVICE_ROLE;
        await tx.exec(`set local role ${service ? "service_role" : userId ? "authenticated" : "anon"}`);
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [service ? "" : (userId ?? "")]);
        return tx.query<Row>(sql, params);
      });
      return { data: out.rows, error: null, count: out.rows.length };
    } catch (e) {
      return { data: null, error: toError(e) };
    }
  }

  class Query implements PromiseLike<Result> {
    private where: string[] = [];
    private params: unknown[] = [];
    private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    private cols = "*";
    private payload: Row = {};
    private onConflict: string[] = [];
    private ignoreDuplicates = false;
    private orderSql = "";
    private max: number | null = null;
    private mode: "many" | "maybe" | "single" = "many";
    private head = false;
    private returning = false;
    constructor(
      private table: string,
      private userId: Actor,
    ) {}

    private bind(value: unknown) {
      this.params.push(param(value));
      return `$${this.params.length}`;
    }
    select(cols = "*", opts: { head?: boolean; count?: string } = {}) {
      if (this.op === "select") this.cols = cols;
      else this.returning = true;
      this.head = opts.head ?? false;
      return this;
    }
    eq(col: string, value: unknown) {
      this.where.push(`${quote(col)} = ${this.bind(value)}`);
      return this;
    }
    in(col: string, values: unknown[]) {
      // A real array parameter (not the JSON form `bind` uses for jsonb values).
      this.params.push(values);
      this.where.push(`${quote(col)} = any($${this.params.length})`);
      return this;
    }
    is(col: string, value: null) {
      void value;
      this.where.push(`${quote(col)} is null`);
      return this;
    }
    order(col: string, o: { ascending?: boolean } = {}) {
      this.orderSql = ` order by ${quote(col)} ${o.ascending !== false ? "asc" : "desc"}`;
      return this;
    }
    limit(n: number) {
      this.max = n;
      return this;
    }
    maybeSingle() {
      this.mode = "maybe";
      return this;
    }
    single() {
      this.mode = "single";
      return this;
    }
    insert(row: Row) {
      this.op = "insert";
      this.payload = row;
      return this;
    }
    upsert(row: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
      this.op = "upsert";
      this.payload = row;
      this.onConflict = opts.onConflict?.split(",") ?? [];
      this.ignoreDuplicates = opts.ignoreDuplicates ?? false;
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.payload = patch;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }

    private sql(): string {
      const t = `public.${quote(this.table)}`;
      const where = this.where.length ? ` where ${this.where.join(" and ")}` : "";
      const returning = this.returning ? " returning *" : "";
      const keys = Object.keys(this.payload);
      switch (this.op) {
        case "select":
          return `select ${this.head ? "1" : this.cols} from ${t}${where}${this.orderSql}${this.max !== null ? ` limit ${this.max}` : ""}`;
        case "delete":
          return `delete from ${t}${where}${returning}`;
        case "update": {
          const sets = keys.map((k) => `${quote(k)} = ${this.bind(this.payload[k])}`).join(", ");
          return `update ${t} set ${sets}${where}${returning}`;
        }
        default: {
          const values = keys.map((k) => this.bind(this.payload[k])).join(", ");
          const conflict =
            this.op === "upsert"
              ? ` on conflict (${this.onConflict.map(quote).join(", ")}) ${
                  this.ignoreDuplicates
                    ? "do nothing"
                    : `do update set ${keys.map((k) => `${quote(k)} = excluded.${quote(k)}`).join(", ")}`
                }`
              : "";
          return `insert into ${t} (${keys.map(quote).join(", ")}) values (${values})${conflict}${returning}`;
        }
      }
    }

    private async run(): Promise<Result> {
      const result = await asUser(this.userId, this.sql(), this.params);
      if (result.error || !Array.isArray(result.data)) return result;
      if (this.op !== "select" && !this.returning) return { data: null, error: null };
      const rows = result.data as Row[];
      if (this.mode === "many") return { data: rows, error: null, count: rows.length };
      if (this.mode === "single" && rows.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: `${rows.length} rows returned for .single()`, details: null, hint: null } };
      }
      return { data: rows[0] ?? null, error: null, count: rows.length };
    }

    then<T, U>(ok?: (v: Result) => T | PromiseLike<T>, bad?: (e: unknown) => U | PromiseLike<U>) {
      return this.run().then(ok, bad);
    }
  }
  /** A PostgREST-style rpc: calls a public function as `userId`, passing named args. */
  async function rpc(userId: Actor, fn: string, args: Record<string, unknown>): Promise<Result> {
    const names = Object.keys(args);
    const sql = `select * from public.${quote(fn)}(${names.map((n, i) => `${quote(n)} := $${i + 1}`).join(", ")})`;
    const result = await asUser(userId, sql, names.map((n) => param(args[n])));
    // PostgREST reports a missing function as PGRST202, not 42883.
    if (result.error?.code === "42883") return { ...result, error: { ...result.error, code: "PGRST202" } };
    return result;
  }
  return {
    db,
    /** Run raw SQL as the database owner (setup, assertions that bypass RLS). */
    admin: async <T extends Row = Row>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows,
    /** Create the auth.users row a user must have for the FK to hold. */
    addUser: async (id: string) => void (await db.query("insert into auth.users (id) values ($1) on conflict do nothing", [id])),
    /** A supabase-js-shaped client acting as `userId` (null = signed out → role anon; "service_role" = the server's admin key). */
    clientFor: (userId: Actor) => ({
      auth: { getUser: async () => ({ data: { user: userId && userId !== SERVICE_ROLE ? { id: userId } : null }, error: null }) },
      from: (table: string) => new Query(table, userId),
      rpc: (fn: string, args: Record<string, unknown> = {}) => rpc(userId, fn, args),
    }),
  };
}

export type RealDb = Awaited<ReturnType<typeof createRealDb>>;
