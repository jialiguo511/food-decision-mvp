import { afterEach, describe, expect, it, vi } from "vitest";
import { baseDefaults } from "@/lib/recommend/rememberedDefaults";
import { cookContext } from "@/test/cookFixtures";
import type { ActiveSession, CookRecommendation } from "@/lib/types";
import { errorCopy, friendlyActionError } from "./errorCopy";
import { isInventoryLimited, isNearbySession } from "./sessionKind";

const d = { ...baseDefaults(), cook: cookContext() };
const rec = (o: Partial<CookRecommendation> = {}) =>
  ({ decision_mode: "cook", role: "best_match", title: "x", inventory_note: null, ...o }) as CookRecommendation;
const session = (o: Partial<ActiveSession>): ActiveSession => ({ session_id: "s", context: d.cook, recommendations: [], ...o });

afterEach(() => vi.restoreAllMocks());

describe("session kind", () => {
  it("nearby only when the order context carries the nearby flag", () => {
    expect(isNearbySession(session({ context: { ...d.order, nearby: true } }))).toBe(true);
    expect(isNearbySession(session({ context: d.order }))).toBe(false);
  });

  it("'Use what I have' is limited when short of three or flagged; buying never is", () => {
    const inv = { ...d.cook, shopping: "inventory_only" as const };
    expect(isInventoryLimited(session({ context: inv, recommendations: [] }))).toBe(true);
    expect(isInventoryLimited(session({ context: inv, recommendations: [rec(), rec(), rec({ inventory_note: "Thin." })] }))).toBe(true);
    expect(isInventoryLimited(session({ context: inv, recommendations: [rec(), rec(), rec()] }))).toBe(false);
    expect(isInventoryLimited(session({ context: d.cook, recommendations: [] }))).toBe(false);
  });
});

describe("error copy", () => {
  it("location denied says why location is needed and offers food ideas by type", () => {
    expect(errorCopy("location_denied")).toMatchObject({ title: "We need your location to find nearby food.", byType: true });
  });

  it("a known failure gets its own message; only a code we have no words for gets the plain generic one — never the raw detail", () => {
    // These used to ALL read "Couldn't find good options this time", whatever actually went wrong.
    expect(errorCopy("malformed_output")).toMatchObject({ title: "The answer came back in a form we couldn't use.", retry: true });
    expect(errorCopy("upstream_error").title).not.toMatch(/HTTP|error_code|Anthropic|good options/);
    expect(errorCopy("a_code_added_later" as never)).toMatchObject({ title: "Something went wrong.", retry: true });
  });

  it("can't-retry cases don't offer Try again", () => {
    expect(errorCopy("places_not_configured").retry).toBe(false);
    expect(errorCopy("unauthenticated").retry).toBe(false);
  });

  it("raw action errors are logged and replaced; the app's own copy passes through", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyActionError('duplicate key value violates "x"', "Couldn't save.")).toBe("Couldn't save.");
    expect(log).toHaveBeenCalled();
    expect(friendlyActionError("You are signed out. Please sign in again.", "x")).toBe("You are signed out. Please sign in again.");
  });
});
