// POST /api/image for "Order it" / "Grab it" cards: an illustrative real photo or nothing —
// never generated, never metered as a generation, and never for a real place.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
const resolve = vi.fn();
const generate = vi.fn();
const consume = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.clientFor("user-1") }));
vi.mock("@/lib/images", () => ({ resolveImageProvider: () => ({ resolve: (q: string) => resolve(q) }) }));
vi.mock("@/lib/images/generated", async (original) => ({ ...(await original<typeof import("@/lib/images/generated")>()), resolveImageGenerator: () => ({ model: "m", generate: (p: string) => generate(p) }) }));
vi.mock("@/lib/usage/consume", () => ({ consumeUsage: (...a: unknown[]) => consume(...a) }));

import { POST } from "./route";

const call = (body: unknown) => POST(new Request("http://localhost/api/image", { method: "POST", body: JSON.stringify(body) }));
const PHOTO = { url: "https://img/a.jpg", photographerName: "Pat", photographerUrl: "https://p/pat", sourceUrl: "https://p/a" };
const order = { decision_mode: "order", role: "alternative", title: "Chicken rice bowl", reason: "r", search_terms: ["chicken bowl"], order_notes: "n", modification: null, watch: null, estimated_calories: 600, estimated_protein_g: 40 };
const snack = { decision_mode: "store_snack", role: "lowest_effort", title: "Greek yogurt cup", reason: "r", what_to_look_for: "plain", backup: null, watch: null, estimated_calories: 150, estimated_protein_g: 15 };
const place = { decision_mode: "nearby", role: "best_match", title: "Real Cafe", place_id: "p1", reason: "r", look_for: null, category: "Cafe", photo_name: "places/p1/photos/x" };

beforeEach(() => {
  db = createFakeDb();
  resolve.mockReset();
  generate.mockReset();
  consume.mockReset();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  db.seed("decision_sessions", { id: "s1", user_id: "user-1", context: {}, recommendations: [recipe(), snack, order] });
  db.seed("decision_sessions", { id: "s2", user_id: "user-1", context: {}, recommendations: [place] });
});

describe("illustrative photos for order / snack cards", () => {
  it("returns a real photo with its credit; searched from the card's title", async () => {
    resolve.mockResolvedValue(PHOTO);
    const body = await (await call({ session_id: "s1", index: 2 })).json();
    expect(body).toEqual({ source: "photo", ...PHOTO });
    expect(resolve).toHaveBeenCalledWith("chicken rice bowl");
  });

  it("no matching photo: a settled 'no_image' (not a failure, not retried)", async () => {
    resolve.mockResolvedValue(null);
    expect(await (await call({ session_id: "s1", index: 1 })).json()).toEqual({ url: null, reason: "no_image" });
  });

  it("never generates a picture and never spends the image allowance", async () => {
    resolve.mockResolvedValue(null);
    await call({ session_id: "s1", index: 1 });
    await call({ session_id: "s1", index: 2 });
    expect(generate).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });

  it("a real place never gets a stock or generated picture: no lookup at all", async () => {
    expect(await (await call({ session_id: "s2", index: 0 })).json()).toEqual({ url: null, reason: "unavailable" });
    expect(resolve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("someone else's card, or a Saved row, is not served", async () => {
    expect(await (await call({ saved_id: "nope" })).json()).toEqual({ url: null, reason: "unavailable" });
    expect(resolve).not.toHaveBeenCalled();
  });
});
