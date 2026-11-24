import { describe, expect, it } from "vitest";
import { appCorsHeaders, bearerToken, isAppOrigin } from "./appOrigin";

describe("bundled-app origin (proof of concept)", () => {
  it("only the app's own origin gets CORS headers", () => {
    expect(isAppOrigin("capacitor://localhost")).toBe(true);
    expect(appCorsHeaders("capacitor://localhost")["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    for (const other of ["https://evil.example", "null", "capacitor://evil", "http://localhost", null]) {
      expect(appCorsHeaders(other)).toEqual({});
    }
  });

  it("reads only a well-formed bearer token", () => {
    expect(bearerToken("Bearer abc.def.ghi-jkl_mnopqrstuvwxyz")).toBe("abc.def.ghi-jkl_mnopqrstuvwxyz");
    expect(bearerToken("bearer abc.def.ghi-jkl_mnopqrstuvwxyz")).toBeNull();
    expect(bearerToken("Bearer short")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
