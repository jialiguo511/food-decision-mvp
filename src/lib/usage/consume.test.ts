import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeUsage, resetUsageWarning } from "./consume";
import { DEFAULT_LIMITS, limitFor, USAGE_KINDS } from "./limits";

const rpc = vi.fn();
const client = { rpc } as unknown as Parameters<typeof consumeUsage>[0];

beforeEach(() => {
  rpc.mockReset();
  resetUsageWarning();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("limitFor — one place for the numbers", () => {
  it("has a positive whole-number default for every kind of paid call", () => {
    expect(USAGE_KINDS.sort()).toEqual(["enrich", "image", "interpret", "nearby", "place_photo", "recommend"]);
    for (const kind of USAGE_KINDS) expect(Number.isInteger(DEFAULT_LIMITS[kind]) && DEFAULT_LIMITS[kind] > 0).toBe(true);
  });

  it("takes a deployment override only if it is a sensible whole number", () => {
    expect(limitFor("recommend", { USAGE_LIMIT_RECOMMEND: "75" })).toBe(75);
    for (const bad of ["0", "-5", "abc", "1.5", "", "99999999", " "]) expect(limitFor("recommend", { USAGE_LIMIT_RECOMMEND: bad })).toBe(DEFAULT_LIMITS.recommend);
    expect(limitFor("image", { USAGE_LIMIT_RECOMMEND: "75" })).toBe(DEFAULT_LIMITS.image);
  });

  it("nearby search is metered tighter than the general allowance it is part of", () => {
    expect(DEFAULT_LIMITS.nearby).toBeLessThan(DEFAULT_LIMITS.recommend);
  });
});

describe("consumeUsage", () => {
  it("passes the kind and its limit to the database function", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, used: 4 }], error: null });
    expect(await consumeUsage(client, "image", { env: { USAGE_LIMIT_IMAGE: "9" } })).toEqual({ allowed: true, used: 4, limit: 9 });
    expect(rpc).toHaveBeenCalledWith("consume_usage", { p_kind: "image", p_limit: 9 });
  });

  it("reports the limit, with how much was used", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: false, used: 30 }], error: null });
    expect(await consumeUsage(client, "recommend", { env: {} })).toEqual({ allowed: false, reason: "limit", used: 30, limit: 30 });
  });

  it("an answer it can't read is 'unavailable', never 'allowed'", async () => {
    for (const data of [null, [], [{}], [{ allowed: "yes" }], "ok"]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect(await consumeUsage(client, "recommend", { env: {} })).toEqual({ allowed: false, reason: "unavailable" });
    }
  });

  it("a throw is 'unavailable'", async () => {
    rpc.mockRejectedValue(new Error("network"));
    expect(await consumeUsage(client, "recommend", { env: {} })).toEqual({ allowed: false, reason: "unavailable" });
  });

  it("the function missing: refused in production, allowed (once-warned) in development", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "no function" } });
    expect(await consumeUsage(client, "recommend", { env: { NODE_ENV: "production" } })).toEqual({ allowed: false, reason: "unavailable" });
    expect(await consumeUsage(client, "recommend", { env: { NODE_ENV: "development" } })).toMatchObject({ allowed: true });
    await consumeUsage(client, "recommend", { env: { NODE_ENV: "development" } });
    expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
  });

  it("any other database error is refused even in development — only 'not migrated yet' is excused", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    expect(await consumeUsage(client, "recommend", { env: { NODE_ENV: "development" } })).toEqual({ allowed: false, reason: "unavailable" });
  });
});
