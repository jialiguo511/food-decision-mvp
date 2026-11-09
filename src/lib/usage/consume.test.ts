import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeUsage, resetUsageWarning } from "./consume";
import { DEFAULT_GLOBAL_LIMITS, DEFAULT_LIMITS, globalLimitFor, isPausedByEnv, limitFor, USAGE_KINDS } from "./limits";

const rpc = vi.fn();
const client = { rpc } as unknown as NonNullable<NonNullable<Parameters<typeof consumeUsage>[2]>["client"]>;
const USER = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  rpc.mockReset();
  resetUsageWarning();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("limitFor — one place for the numbers", () => {
  it("has a positive whole-number default for every kind of paid call", () => {
    expect([...USAGE_KINDS].sort()).toEqual(["enrich", "feedback", "image", "interpret", "nearby", "place_photo", "recommend"]);
    for (const kind of USAGE_KINDS) expect(Number.isInteger(DEFAULT_LIMITS[kind]) && DEFAULT_LIMITS[kind] > 0).toBe(true);
  });

  it("takes a deployment override only if it is a sensible whole number", () => {
    expect(limitFor("recommend", { USAGE_LIMIT_RECOMMEND: "75" })).toBe(75);
    for (const bad of ["0", "-5", "abc", "1.5", "", "99999999", " "]) expect(limitFor("recommend", { USAGE_LIMIT_RECOMMEND: bad })).toBe(DEFAULT_LIMITS.recommend);
    expect(limitFor("image", { USAGE_LIMIT_RECOMMEND: "75" })).toBe(DEFAULT_LIMITS.image);
  });

  it("the app-wide ceiling has a sensible default for every kind and is never below one person's allowance", () => {
    for (const kind of USAGE_KINDS) expect(DEFAULT_GLOBAL_LIMITS[kind], kind).toBeGreaterThanOrEqual(DEFAULT_LIMITS[kind]);
    expect(globalLimitFor("recommend", { USAGE_GLOBAL_RECOMMEND: "x" })).toBe(DEFAULT_GLOBAL_LIMITS.recommend);
    expect(globalLimitFor("recommend", { USAGE_GLOBAL_RECOMMEND: "0" })).toBe(DEFAULT_GLOBAL_LIMITS.recommend);
  });

  it("nearby search is metered tighter than the general allowance it is part of", () => {
    expect(DEFAULT_LIMITS.nearby).toBeLessThan(DEFAULT_LIMITS.recommend);
  });
});

describe("consumeUsage", () => {
  it("uses the server's own admin client by default; without the service-role key production refuses and development warns", async () => {
    // (no `client` option → createAdminClient(), which is null in this environment: no SUPABASE_SERVICE_ROLE_KEY)
    expect(await consumeUsage(USER, "recommend", { env: { NODE_ENV: "production" } })).toEqual({ allowed: false, reason: "unavailable" });
    expect(await consumeUsage(USER, "recommend", { env: { NODE_ENV: "development" } })).toMatchObject({ allowed: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes the kind and its limit to the database function", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, used: 4 }], error: null });
    expect(await consumeUsage(USER, "image", { client, env: { USAGE_LIMIT_IMAGE: "9" } })).toEqual({ allowed: true, used: 4, limit: 9 });
    expect(rpc).toHaveBeenCalledWith("consume_usage", { p_user: USER, p_kind: "image", p_limit: 9, p_global_limit: DEFAULT_GLOBAL_LIMITS.image });
  });

  it("sends the app-wide ceiling too, and honours an override of it", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, used: 1, refused_by: null }], error: null });
    await consumeUsage(USER, "recommend", { client, env: { USAGE_GLOBAL_RECOMMEND: "50" } });
    expect(rpc).toHaveBeenCalledWith("consume_usage", expect.objectContaining({ p_global_limit: 50 }));
  });

  it("tells the person's own limit from the whole app's ceiling and from the owner's off switch", async () => {
    rpc.mockResolvedValueOnce({ data: [{ allowed: false, used: 7, refused_by: "global" }], error: null });
    expect(await consumeUsage(USER, "recommend", { client, env: {} })).toEqual({ allowed: false, reason: "global_limit" });
    rpc.mockResolvedValueOnce({ data: [{ allowed: false, used: 0, refused_by: "paused" }], error: null });
    expect(await consumeUsage(USER, "recommend", { client, env: {} })).toEqual({ allowed: false, reason: "paused" });
    rpc.mockResolvedValueOnce({ data: [{ allowed: false, used: 30, refused_by: "user" }], error: null });
    expect(await consumeUsage(USER, "recommend", { client, env: {} })).toMatchObject({ allowed: false, reason: "limit", used: 30 });
    // signed out / nonsense arguments are never reported as "the person is over their limit"
    rpc.mockResolvedValueOnce({ data: [{ allowed: false, used: 0, refused_by: "invalid" }], error: null });
    expect(await consumeUsage(USER, "recommend", { client, env: {} })).toEqual({ allowed: false, reason: "unavailable" });
  });

  it("PAUSED_KINDS stops a paid call before the database is even asked — all kinds, or just the named ones", async () => {
    expect(await consumeUsage(USER, "image", { client, env: { PAUSED_KINDS: "all" } })).toEqual({ allowed: false, reason: "paused" });
    expect(await consumeUsage(USER, "image", { client, env: { PAUSED_KINDS: "recommend, Image" } })).toEqual({ allowed: false, reason: "paused" });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: [{ allowed: true, used: 1, refused_by: null }], error: null });
    expect(await consumeUsage(USER, "nearby", { client, env: { PAUSED_KINDS: "recommend,image" } })).toMatchObject({ allowed: true });
    expect(isPausedByEnv("nearby", { PAUSED_KINDS: "" })).toBe(false);
    expect(isPausedByEnv("nearby", {})).toBe(false);
  });

  it("reports the limit, with how much was used", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, used: 30 }], error: null });
    expect(await consumeUsage(USER, "recommend", { client, env: {} })).toEqual({ allowed: false, reason: "limit", used: 30, limit: 30 });
  });

  it("an answer it can't read is 'unavailable', never 'allowed'", async () => {
    for (const data of [null, [], [{}], [{ allowed: "yes" }], "ok"]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect(await consumeUsage(USER, "recommend", { client, env: {} })).toEqual({ allowed: false, reason: "unavailable" });
    }
  });

  it("a throw is 'unavailable'", async () => {
    rpc.mockRejectedValue(new Error("network"));
    expect(await consumeUsage(USER, "recommend", { client, env: {} })).toEqual({ allowed: false, reason: "unavailable" });
  });

  it("the function missing: refused in production, allowed (once-warned) in development", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "no function" } });
    expect(await consumeUsage(USER, "recommend", { client, env: { NODE_ENV: "production" } })).toEqual({ allowed: false, reason: "unavailable" });
    expect(await consumeUsage(USER, "recommend", { client, env: { NODE_ENV: "development" } })).toMatchObject({ allowed: true });
    await consumeUsage(USER, "recommend", { client, env: { NODE_ENV: "development" } });
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
  });

  it("any other database error is refused even in development — only 'not migrated yet' is excused", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    expect(await consumeUsage(USER, "recommend", { client, env: { NODE_ENV: "development" } })).toEqual({ allowed: false, reason: "unavailable" });
  });
});
