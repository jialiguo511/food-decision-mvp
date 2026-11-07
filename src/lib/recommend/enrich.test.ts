import { describe, expect, it } from "vitest";
import { applyEnrichment, buildEnrichInput, ENRICH_SYSTEM_PROMPT, parseEnrichment } from "./enrich";
import { place } from "@/test/savedFixtures";
import type { NearbyRecommendation, OrderContext } from "../types";

const recs: NearbyRecommendation[] = [
  place({ place_id: "a", role: "best_match", reason: "rule a", look_for: null, enriched: false }),
  place({ place_id: "b", role: "lowest_effort", reason: "rule b", look_for: null, enriched: false }),
  place({ place_id: "c", role: "alternative", reason: "rule c", look_for: null, enriched: false }),
];
const item = (place_id: string, reason = "Close and a good fit.", look_for = "A grilled chicken and rice bowl, sauce on the side.") => ({ place_id, reason, look_for });
const json = (items: unknown[]) => JSON.stringify({ items });

describe("parseEnrichment", () => {
  it("accepts wording for the places it was asked about", () => {
    const out = parseEnrichment(json([item("a"), item("b"), item("c")]), recs, []);
    expect([...out.keys()]).toEqual(["a", "b", "c"]);
  });

  it("tolerates a fenced JSON block", () => {
    expect(parseEnrichment("```json\n" + json([item("a")]) + "\n```", recs, []).size).toBe(1);
  });

  it("drops a place that isn't one of the three, or is repeated — the others still count", () => {
    const out = parseEnrichment(json([item("zzz"), item("a"), item("a", "second"), item("b")]), recs, []);
    expect([...out.keys()]).toEqual(["a", "b"]);
    expect(out.get("a")?.reason).toBe("Close and a good fit.");
  });

  it("drops text that states a price, a calorie figure or a quoted dish name", () => {
    expect(parseEnrichment(json([item("a", "Great at $12.")]), recs, []).size).toBe(0);
    expect(parseEnrichment(json([item("a", "ok", "About 600 calories, nice.")]), recs, []).size).toBe(0);
    expect(parseEnrichment(json([item("a", "ok", 'Try the "Spicy Power Bowl".')]), recs, []).size).toBe(0);
  });

  it("an allergen in the reason drops it; one in look_for is withheld, not rewritten", () => {
    const out = parseEnrichment(json([item("a", "Great peanut sauce.", "A rice bowl."), item("b", "Fine.", "Noodles with peanut sauce.")]), recs, ["Peanuts"]);
    expect(out.has("a")).toBe(false);
    expect(out.get("b")).toEqual({ reason: "Fine.", look_for: null });
  });

  it("garbage or the wrong shape changes nothing", () => {
    for (const text of ["not json", "{}", json([]), JSON.stringify({ items: [{ place_id: "a" }] })]) {
      expect(parseEnrichment(text, recs, []).size).toBe(0);
    }
  });
});

describe("applyEnrichment", () => {
  it("merges wording in place: order, roles and place facts never change", () => {
    const merged = applyEnrichment(recs, parseEnrichment(json([item("b"), item("c")]), recs, []));
    expect(merged.map((r) => [r.place_id, r.role])).toEqual(recs.map((r) => [r.place_id, r.role]));
    expect(merged[0]).toBe(recs[0]); // no wording for a → untouched, still pending
    expect(merged[1]).toMatchObject({ reason: "Close and a good fit.", enriched: true, title: recs[1].title, maps_url: recs[1].maps_url });
  });
});

describe("buildEnrichInput", () => {
  it("hands over only what wording needs — never coordinates, a full address or a link", () => {
    const context = { decision_mode: "order", hunger: "normal", craving_category: "sweet", craving_note: null, method: "eat_nearby", meal_budget: "no_preference", travel_willingness: "no_preference", nearby: true } as OrderContext;
    const input = buildEnrichInput(recs, context, { goal: "maintain", allergies: ["Fish"], dislikes: [], dietary_patterns: [], dietary_other: null });
    expect(input.places).toHaveLength(3);
    expect(JSON.stringify(input)).not.toMatch(/maps\.example|address|latitude|1 Main St/);
    expect(input.hard_constraints.allergies).toEqual(["Fish"]);
  });

  it("the system prompt forbids menu items, prices, numbers and safety claims", () => {
    expect(ENRICH_SYSTEM_PROMPT).toMatch(/never write a price/i);
    expect(ENRICH_SYSTEM_PROMPT).toMatch(/allerg/i);
  });
});
