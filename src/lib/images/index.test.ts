import { describe, expect, it } from "vitest";
import { resolveImageProvider } from "./index";

describe("resolveImageProvider", () => {
  it("falls back to the no-op provider when no API key is configured", async () => {
    const provider = resolveImageProvider(undefined);
    const result = await provider.resolve("chicken spinach rice bowl");

    expect(result).toBeNull();
  });
});
