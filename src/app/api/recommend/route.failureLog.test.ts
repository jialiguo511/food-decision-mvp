// When a request fails, ONE log line ties together the browser's request id, the
// error code, the HTTP status, how far the request got and how long each stage took —
// so "it failed once on the Preview" can be found by the id the screen shows. It holds
// names, codes and milliseconds only.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";

let db = createFakeDb();
const generate = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor("user-1") }));
vi.mock("./claude", () => ({ generateRecommendations: (...args: unknown[]) => generate(...args) }));
vi.mock("@/lib/places", () => ({ resolvePlacesProvider: () => null }));

import { POST } from "./route";

const COOK = { decision_mode: "cook", cook_minutes: 30, hunger: "normal", effort: "some", shopping: "can_buy", craving: "xylophone-casserole-7731", ingredients_on_hand: ["secret-ingredient-5521"], budget_override_usd: 10 };
const send = (requestId = "req-abc123") => POST(new Request("http://localhost/api/recommend", { method: "POST", headers: { "X-Request-Id": requestId }, body: JSON.stringify({ context: COOK }) }));
let warnings: unknown[][];

beforeEach(() => {
  db = createFakeDb();
  generate.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key-never-logged");
  warnings = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation((...args) => void warnings.push(args));
});

const failedLine = () => warnings.find((w) => w[0] === "[recommend] failed")?.[1] as { requestId: string; code: string; status: number; last_stage: string; stages: Record<string, number>; total_ms: number } | undefined;

describe("the failure line", () => {
  it("carries the request id, code, status, the last stage reached and every stage's time", async () => {
    generate.mockImplementation(async (_c: unknown, _i: unknown, _k: unknown, timer?: { record: (n: string, ms: number) => void }) => {
      timer?.record("prompt", 12);
      timer?.record("model", 45_000);
      return { ok: false, code: "upstream_timeout", message: "The recommender took too long to respond." };
    });
    const res = await send("req-abc123");
    expect(res.status).toBe(504);
    const line = failedLine()!;
    expect(line).toMatchObject({ requestId: "req-abc123", code: "upstream_timeout", status: 504, last_stage: "model" });
    expect(line.stages.model).toBe(45_000);
    expect(typeof line.total_ms).toBe("number");
  });

  it("says where a failure BEFORE the model happened, too (the usage check, the profile read…)", async () => {
    db.failRpc({ code: "PGRST202", message: "no function" });
    vi.stubEnv("NODE_ENV", "production");
    const res = await send("req-usage");
    expect(res.status).toBe(503);
    expect(failedLine()).toMatchObject({ requestId: "req-usage", code: "usage_unavailable", last_stage: "usage" });
    vi.unstubAllEnvs();
  });

  it("records one line per failed request with its own id", async () => {
    generate.mockResolvedValue({ ok: false, code: "malformed_output", message: "bad" });
    await send("one");
    await send("two");
    expect(warnings.filter((w) => w[0] === "[recommend] failed").map((w) => (w[1] as { requestId: string }).requestId)).toEqual(["one", "two"]);
  });

  it("holds no answers, foods, craving, keys or model output — only names, codes and numbers", async () => {
    generate.mockResolvedValue({ ok: false, code: "constraint_violation", message: "Recipe mentions secret-ingredient-5521", details: ["craving xylophone-casserole-7731"] });
    await send();
    const logged = JSON.stringify(failedLine());
    for (const leak of ["xylophone", "secret-ingredient", "sk-ant", "Recipe mentions", "craving"]) expect(logged).not.toContain(leak);
  });
});
