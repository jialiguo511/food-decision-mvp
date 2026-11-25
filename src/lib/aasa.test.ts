import { describe, expect, it } from "vitest";
import { aasaBody } from "./aasa";

describe("apple-app-site-association", () => {
  it("is off until a well-formed app id is configured", () => {
    expect(aasaBody(undefined)).toBeNull();
    expect(aasaBody("not-an-id")).toBeNull();
  });
  it("opens only the sign-in confirmation path in the app", () => {
    expect(aasaBody("ABCDE12345.com.jialiguo.whatshouldieat")).toEqual({
      applinks: { details: [{ appIDs: ["ABCDE12345.com.jialiguo.whatshouldieat"], components: [{ "/": "/auth/confirm", comment: "Emailed sign-in link" }] }] },
    });
  });
});
