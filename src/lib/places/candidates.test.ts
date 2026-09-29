import { describe, expect, it } from "vitest";
import { buildCandidates } from "./candidates";
import type { NearbyPlace } from "./provider";

const ORIGIN = { latitude: 37.78, longitude: -122.41 };

function place(id: string, overrides: Partial<NearbyPlace> = {}, dLat = 0.001): NearbyPlace {
  return {
    id,
    name: `Place ${id}`,
    category: "Restaurant",
    primary_type: "restaurant",
    address: null,
    location: { latitude: ORIGIN.latitude + dLat, longitude: ORIGIN.longitude },
    operational: true,
    open_now: true,
    price_level: null,
    maps_url: `https://www.google.com/maps/search/?api=1&query_place_id=${id}`,
    ...overrides,
  };
}

describe("buildCandidates", () => {
  it("removes permanently or temporarily closed places and places known to be closed now", () => {
    const result = buildCandidates(
      [
        place("ok"),
        place("perm", { operational: false }),
        place("closed-now", { open_now: false }),
        place("unknown-hours", { open_now: null }),
      ],
      ORIGIN,
    );
    expect(result.map((p) => p.id).sort()).toEqual(["ok", "unknown-hours"]);
  });

  it("removes bars and grocery-type places even if the provider let them through", () => {
    const result = buildCandidates(
      [
        place("bar", { primary_type: "bar" }),
        place("pub", { primary_type: "pub" }),
        place("grocery", { primary_type: "grocery_store" }),
        place("conv", { primary_type: "convenience_store" }),
        place("cafe", { primary_type: "cafe" }),
      ],
      ORIGIN,
    );
    expect(result.map((p) => p.id)).toEqual(["cafe"]);
  });

  it("keeps a restaurant that has no primary type", () => {
    expect(buildCandidates([place("a", { primary_type: null })], ORIGIN)).toHaveLength(1);
  });

  it("attaches a rounded straight-line distance and sorts nearest first", () => {
    const result = buildCandidates([place("far", {}, 0.01), place("near", {}, 0.001)], ORIGIN);
    expect(result.map((p) => p.id)).toEqual(["near", "far"]);
    // 0.001° latitude ≈ 111 m
    expect(result[0].distance_m).toBeGreaterThanOrEqual(100);
    expect(result[0].distance_m).toBeLessThanOrEqual(120);
    expect(result[0].distance_m! % 10).toBe(0);
  });

  it("gives null distance to a place without coordinates, and sorts it last", () => {
    const result = buildCandidates([place("nowhere", { location: null }), place("here")], ORIGIN);
    expect(result.map((p) => [p.id, p.distance_m === null])).toEqual([
      ["here", false],
      ["nowhere", true],
    ]);
  });

  it("keeps only the nearest branch of a same-named chain, and drops repeated ids", () => {
    const result = buildCandidates(
      [
        place("branch-far", { name: "Sweetgreen" }, 0.01),
        place("branch-near", { name: "sweetgreen" }, 0.002),
        place("dup", { name: "Dup" }),
        place("dup", { name: "Dup again" }),
      ],
      ORIGIN,
    );
    expect(result.map((p) => p.id).sort()).toEqual(["branch-near", "dup"]);
  });

  it("excludes ids the user already saw (for 'Show me 3 more')", () => {
    const result = buildCandidates([place("a"), place("b")], ORIGIN, { excludeIds: new Set(["a"]) });
    expect(result.map((p) => p.id)).toEqual(["b"]);
  });

  it("caps the candidate list", () => {
    const many = Array.from({ length: 30 }, (_, i) => place(`p${i}`, {}, 0.001 * (i + 1)));
    expect(buildCandidates(many, ORIGIN)).toHaveLength(20);
    expect(buildCandidates(many, ORIGIN, { max: 5 })).toHaveLength(5);
  });

  it("returns an empty list for no places", () => {
    expect(buildCandidates([], ORIGIN)).toEqual([]);
  });
});
