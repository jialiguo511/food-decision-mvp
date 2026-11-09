import { describe, expect, it } from "vitest";
import type { LocationErrorCode, RecommendErrorCode, TransportErrorCode } from "@/lib/types";
import { transportError } from "../recommendStore";
import { brokenRules, errorCopy } from "./errorCopy";

// Compile-time exhaustive: adding an error code anywhere without listing it here is a type error,
// so a new failure can't silently fall through to the generic message.
const SERVER: Record<RecommendErrorCode, true> = {
  llm_not_configured: true, places_not_configured: true, places_unavailable: true, invalid_location: true, unauthenticated: true, invalid_context: true,
  profile_unavailable: true, malformed_output: true, constraint_violation: true, model_refused: true, truncated_output: true, rate_limited: true,
  upstream_timeout: true, upstream_error: true, session_save_failed: true, daily_limit: true, nearby_limit: true, usage_unavailable: true,
};
const BROWSER: Record<LocationErrorCode | TransportErrorCode, true> = {
  location_unsupported: true, location_denied: true, location_unavailable: true, location_timeout: true, network_error: true, bad_response: true,
};
const ALL = [...Object.keys(SERVER), ...Object.keys(BROWSER)] as (RecommendErrorCode | LocationErrorCode | TransportErrorCode)[];
const generic = errorCopy("some_future_code" as RecommendErrorCode);

describe("errorCopy — one honest message per cause", () => {
  it("every known code has its own words (none falls through to the generic message)", () => {
    for (const code of ALL) expect(errorCopy(code).title, code).not.toBe(generic.title);
  });

  it("no message calls a non-search failure 'couldn't find good options' or promises a retry will work", () => {
    for (const code of [...ALL, "some_future_code" as RecommendErrorCode]) {
      const { title, body } = errorCopy(code);
      expect(`${title} ${body}`, code).not.toMatch(/good options|usually works|second go|should work|will work/i);
    }
  });

  it("the three different ways a request can fail to produce cards are told apart", () => {
    const titles = ["upstream_timeout", "malformed_output", "session_save_failed", "constraint_violation", "profile_unavailable"].map((c) => errorCopy(c as RecommendErrorCode).title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("a rejected set never offers to relax the rules — only a retry, or changing the answers", () => {
    const copy = errorCopy("constraint_violation");
    expect(copy.body).toMatch(/don't loosen/i);
    expect(copy.body).not.toMatch(/ignore|skip|anyway/i);
  });

  it("the generic message is plain and promises nothing", () => {
    expect(generic.title).toBe("Something went wrong.");
    expect(generic.body).toBe("No recommendations were made this time.");
  });
});

describe("transportError — a reply that isn't the app's own", () => {
  it("a gateway/host timeout is 'took too long', a rate limit is a rate limit, everything else is 'couldn't be read'", () => {
    expect(transportError(504).code).toBe("upstream_timeout");
    expect(transportError(408).code).toBe("upstream_timeout");
    expect(transportError(429).code).toBe("rate_limited");
    for (const status of [200, 500, 502, 503, 404]) expect(transportError(status).code, String(status)).toBe("bad_response");
  });

  it("keeps the HTTP status for whoever reads the logs", () => {
    expect(transportError(502).message).toContain("502");
  });
});

describe("which rule a rejected set broke", () => {
  it("is said in the person's words, once each, and only when known", () => {
    expect(brokenRules(["allergy", "time"])).toBe("It broke: an allergy you listed; your time limit.");
    expect(brokenRules([])).toBeNull();
    expect(brokenRules(undefined)).toBeNull();
  });
  it("the general copy no longer claims the set 'mentioned something you avoid'", () => {
    expect(errorCopy("constraint_violation").body).not.toMatch(/mention something you avoid/);
    expect(errorCopy("constraint_violation").retry).toBe(true);
  });
});
