// A minimal in-memory TTL cache, isolated in its own file so it can be
// swapped for something durable (Redis, a KV store) later without touching
// any caller. Scoped to one server process's lifetime — fine for the low
// volume and low stakes of a decorative image lookup; a cold start just
// means the next request re-fetches.

type Entry<V> = { value: V; expiresAt: number };

export class TtlCache<V> {
  private store = new Map<string, Entry<V>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }
}

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
