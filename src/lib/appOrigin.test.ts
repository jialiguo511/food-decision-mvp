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

import { minAppVersion, versionLessThan } from "./appOrigin";
import { isCrossSite } from "./sameOrigin";

describe("app version gate", () => {
  it("compares dotted versions numerically; malformed counts as oldest", () => {
    expect(versionLessThan("1.0.0", "1.0.1")).toBe(true);
    expect(versionLessThan("1.10.0", "1.2.0")).toBe(false);
    expect(versionLessThan("1.2.0", "1.2.0")).toBe(false);
    expect(versionLessThan("", "1.0.0")).toBe(true);
    expect(versionLessThan("x", "1.0.0")).toBe(true);
  });
  it("reads MIN_IOS_APP_VERSION, defaulting to 1.0.0", () => {
    expect(minAppVersion({})).toBe("1.0.0");
    expect(minAppVersion({ MIN_IOS_APP_VERSION: "1.3.0" })).toBe("1.3.0");
    expect(minAppVersion({ MIN_IOS_APP_VERSION: "latest" })).toBe("1.0.0");
  });
});

describe("cross-site guard and the app origin", () => {
  const req = (headers: Record<string, string>) => new Request("https://site.example/api/recommend", { method: "POST", headers: { host: "site.example", ...headers } });
  const TOKEN = "Bearer aaaaaaaaaaaaaaaaaaaaaaaa.bbb.ccc";
  it("lets the app through only with a bearer token and no cookie", () => {
    expect(isCrossSite(req({ origin: "capacitor://localhost", authorization: TOKEN }))).toBe(false);
    expect(isCrossSite(req({ origin: "capacitor://localhost" }))).toBe(true);
    expect(isCrossSite(req({ origin: "capacitor://localhost", authorization: TOKEN, cookie: "sb=1" }))).toBe(true);
    expect(isCrossSite(req({ origin: "https://evil.example", authorization: TOKEN }))).toBe(true);
    expect(isCrossSite(req({ origin: "https://site.example" }))).toBe(false);
  });
});
