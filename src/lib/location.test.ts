import { describe, expect, it } from "vitest";
import { LocationError, locationErrorCode, requestLocation } from "./location";

type PositionCallback = (p: GeolocationPosition) => void;
type ErrorCallback = (e: GeolocationPositionError) => void;

describe("requestLocation", () => {
  it("resolves with just latitude and longitude", async () => {
    const geo = {
      getCurrentPosition: (ok: PositionCallback) =>
        ok({ coords: { latitude: 1.5, longitude: 2.5, accuracy: 10 } } as GeolocationPosition),
    };
    await expect(requestLocation(geo)).resolves.toEqual({ latitude: 1.5, longitude: 2.5 });
  });

  it.each([
    [1, "location_denied"],
    [2, "location_unavailable"],
    [3, "location_timeout"],
  ])("maps browser error %i to %s", async (code, expected) => {
    const geo = {
      getCurrentPosition: (_ok: PositionCallback, fail: ErrorCallback) =>
        fail({ code } as GeolocationPositionError),
    };
    const error = await requestLocation(geo).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LocationError);
    expect((error as LocationError).code).toBe(expected);
    expect((error as LocationError).message.length).toBeGreaterThan(0);
  });

  it("reports an unsupported browser", async () => {
    await expect(requestLocation(undefined)).rejects.toMatchObject({ code: "location_unsupported" });
  });

  it("reports unsupported when getCurrentPosition throws", async () => {
    const geo = {
      getCurrentPosition: () => {
        throw new Error("blocked by permissions policy");
      },
    };
    await expect(requestLocation(geo)).rejects.toMatchObject({ code: "location_unsupported" });
  });

  it("treats an unknown error code as unavailable", () => {
    expect(locationErrorCode(99)).toBe("location_unavailable");
  });
});
