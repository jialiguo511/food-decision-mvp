import { describe, expect, it } from "vitest";
import { distanceMeters, formatDistance, roundDistance } from "./distance";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    const p = { latitude: 40.7128, longitude: -74.006 };
    expect(distanceMeters(p, p)).toBe(0);
  });

  it("matches a known distance (NYC City Hall → Empire State Building ≈ 4.2 km)", () => {
    const cityHall = { latitude: 40.7128, longitude: -74.006 };
    const empireState = { latitude: 40.7484, longitude: -73.9857 };
    expect(distanceMeters(cityHall, empireState)).toBeGreaterThan(4_000);
    expect(distanceMeters(cityHall, empireState)).toBeLessThan(4_500);
  });

  it("is symmetric", () => {
    const a = { latitude: 51.5, longitude: -0.12 };
    const b = { latitude: 51.51, longitude: -0.1 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });

  it("handles the antimeridian", () => {
    const d = distanceMeters({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 });
    expect(d).toBeGreaterThan(20_000);
    expect(d).toBeLessThan(25_000);
  });
});

describe("formatDistance", () => {
  it("labels distance as approximate miles, never a time", () => {
    expect(formatDistance(644)).toBe("≈ 0.4 mi away");
    expect(formatDistance(1609)).toBe("≈ 1.0 mi away");
    expect(formatDistance(644)).not.toMatch(/min|walk/i);
  });

  it("does not print 0.0 for very close places", () => {
    expect(formatDistance(20)).toBe("< 0.1 mi away");
  });

  it("rounds meters to the nearest 10", () => {
    expect(roundDistance(644)).toBe(640);
    expect(roundDistance(646)).toBe(650);
  });
});
