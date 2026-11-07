// A tiny in-memory stand-in for the parts of supabase-js the app's Saved and
// feedback code uses: select / eq / in / order / limit / maybeSingle, insert,
// upsert (with onConflict + ignoreDuplicates against declared unique keys) and
// delete (optionally .select()ed). Every query is applied exactly as written —
// in particular, rows are only filtered by the `.eq("user_id", …)` the code
// itself asks for, so a missing user scope shows up as a leak in tests. It does
// NOT model Postgres RLS; that lives in schema.sql and needs a real database.

type Row = Record<string, unknown>;

const UNIQUE: Record<string, string[]> = {
  saved_recipes: ["user_id", "recipe_key"],
  saved_places: ["user_id", "provider", "place_id"],
  place_feedback: ["user_id", "provider", "place_id"],
  profiles: ["id"],
};

export function createFakeDb() {
  const tables: Record<string, Row[]> = {};
  /** Tables whose every query should fail with this error — e.g. a migration
   *  that was never run (PGRST205), or an RLS/grant refusal (42501). */
  const failing: Record<string, { code: string; message: string; details?: string | null; hint?: string | null }> = {};
  /** Every table a query was started against, in order — to assert batching. */
  const queries: string[] = [];
  let seq = 0;

  /** consume_usage's semantics, in memory: per (user, kind) — the fake has no
   *  clock, so one "day". Mirrors the SQL (supabase/migrations/2026-11-07_*):
   *  add one only while under the limit; refused calls change nothing. */
  const usage = new Map<string, number>();
  /** Set to make every rpc fail like a database that never ran the migration. */
  let rpcError: { code: string; message: string } | null = null;
  const rpc = async (userId: string | null, fn: string, args: Record<string, unknown>) => {
    if (rpcError) return { data: null, error: rpcError };
    if (fn !== "consume_usage") return { data: null, error: { code: "PGRST202", message: `no function ${fn}` } };
    const limit = args.p_limit as number;
    const kind = args.p_kind as string;
    if (!userId || !Number.isInteger(limit) || limit < 1 || !/^[a-z_]{1,32}$/.test(kind)) return { data: [{ allowed: false, used: 0 }], error: null };
    const key = `${userId}:${kind}`;
    const used = usage.get(key) ?? 0;
    if (used >= limit) return { data: [{ allowed: false, used }], error: null };
    usage.set(key, used + 1);
    return { data: [{ allowed: true, used: used + 1 }], error: null };
  };
  const rows = (table: string) => (tables[table] ??= []);

  /** Tables where delete() "succeeds" but removes nothing — what RLS with no
   *  matching policy does: no error, no effect. */
  const swallowDeletes = new Set<string>();

  type Result = { data: unknown; error: { code: string; message: string; details?: string | null; hint?: string | null } | null };
  class Query implements PromiseLike<Result> {
    private filters: ((r: Row) => boolean)[] = [];
    private op: "select" | "delete" | "update" | "insert" = "select";
    private inserted: Row | null = null;
    private patch: Row = {};
    private returning = false;
    private max = Infinity;
    private orderBy: { col: string; asc: boolean } | null = null;
    private isSingle = false;
    constructor(private table: string) {}

    select() {
      if (this.op === "delete" || this.op === "insert") this.returning = true;
      return this;
    }
    eq(col: string, value: unknown) {
      this.filters.push((r) => r[col] === value);
      return this;
    }
    in(col: string, values: unknown[]) {
      this.filters.push((r) => values.includes(r[col]));
      return this;
    }
    not() {
      return this;
    }
    gte() {
      return this;
    }
    order(col: string, o: { ascending?: boolean } = {}) {
      this.orderBy = { col, asc: o.ascending !== false };
      return this;
    }
    limit(n: number) {
      this.max = n;
      return this;
    }
    maybeSingle() {
      this.isSingle = true;
      return this;
    }
    /** Like maybeSingle for the fake: an insert(...).select().single() returns the new row. */
    single() {
      this.isSingle = true;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.patch = patch;
      return this;
    }
    insert(row: Row) {
      const stored = { id: `id-${++seq}`, created_at: new Date(1e12 + seq * 1000).toISOString(), ...row };
      rows(this.table).push(stored);
      this.op = "insert";
      this.inserted = stored;
      return this;
    }
    upsert(row: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
      const keys = opts.onConflict?.split(",") ?? UNIQUE[this.table] ?? [];
      const existing = rows(this.table).find((r) => keys.every((k) => r[k] === row[k]));
      if (!existing) this.insert(row);
      else if (!opts.ignoreDuplicates) Object.assign(existing, row);
      return this;
    }

    private run(): Result {
      if (failing[this.table]) return { data: null, error: failing[this.table] };
      const match = (r: Row) => this.filters.every((f) => f(r));
      if (this.op === "insert") return { data: this.returning ? (this.isSingle ? this.inserted : [this.inserted]) : null, error: null };
      if (this.op === "delete" && swallowDeletes.has(this.table)) return { data: null, error: null };
      if (this.op === "delete") {
        const gone = rows(this.table).filter(match);
        tables[this.table] = rows(this.table).filter((r) => !gone.includes(r));
        return { data: this.returning ? gone : null, error: null };
      }
      if (this.op === "update") {
        for (const r of rows(this.table).filter(match)) Object.assign(r, this.patch);
        return { data: null, error: null };
      }
      let out = rows(this.table).filter(match);
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      out = out.slice(0, this.max);
      return { data: this.isSingle ? (out[0] ?? null) : out, error: null };
    }
    then<T, U>(ok?: (v: Result) => T | PromiseLike<T>, bad?: (e: unknown) => U | PromiseLike<U>) {
      return Promise.resolve().then(() => this.run()).then(ok, bad);
    }
  }

  return {
    tables,
    queries,
    /** Make delete() on `table` silently do nothing (RLS-style). */
    swallowDeletesOn(table: string) {
      swallowDeletes.add(table);
    },
    /** Make every query on `table` fail with `error`. */
    failTable(table: string, error: { code: string; message: string; details?: string | null; hint?: string | null }) {
      failing[table] = error;
    },
    seed(table: string, row: Row) {
      rows(table).push({ id: `id-${++seq}`, created_at: new Date(1e12 + seq * 1000).toISOString(), ...row });
    },
    count: (table: string) => rows(table).length,
    /** How many paid calls of `kind` this user has used (consume_usage). */
    usageOf: (userId: string, kind: string) => usage.get(`${userId}:${kind}`) ?? 0,
    /** Pretend the usage migration was never run (every rpc errors). */
    failRpc: (error: { code: string; message: string } | null) => void (rpcError = error),
    clientFor: (userId: string | null) => ({
      auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null } }) },
      from: (table: string) => (queries.push(table), new Query(table)),
      rpc: (fn: string, args: Record<string, unknown> = {}) => rpc(userId, fn, args),
    }),
  };
}
