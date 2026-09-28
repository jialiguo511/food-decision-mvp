import { afterEach, describe, expect, it, vi } from "vitest";
import { createPexelsProvider } from "./pexels";

// Each test uses a distinct query so it doesn't hit another test's cached
// result — the provider's cache is keyed on the normalized query and shared
// across createPexelsProvider() calls (see pexels.ts).

describe("createPexelsProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns the image and attribution on a successful response, and caches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photos: [
          {
            src: {
              landscape: "https://images.pexels.com/photo-1-landscape.jpg",
              large: "https://images.pexels.com/photo-1-large.jpg",
            },
            photographer: "Jane Doe",
            photographer_url: "https://www.pexels.com/@jane",
            url: "https://www.pexels.com/photo/1",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createPexelsProvider("test-key");
    const result = await provider.resolve("Chicken   Spinach Rice Bowl");

    expect(result).toEqual({
      url: "https://images.pexels.com/photo-1-landscape.jpg",
      photographerName: "Jane Doe",
      photographerUrl: "https://www.pexels.com/@jane",
      sourceUrl: "https://www.pexels.com/photo/1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A differently-cased/spaced request for the same dish hits the cache,
    // not Pexels again.
    await provider.resolve("chicken  spinach   rice bowl");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when Pexels has no results for the query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ photos: [] }) }),
    );

    const provider = createPexelsProvider("test-key");
    const result = await provider.resolve("an extremely obscure invented dish");

    expect(result).toBeNull();
  });

  it("returns null, not a throw, when the request errors (network failure/timeout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const provider = createPexelsProvider("test-key");
    const result = await provider.resolve("a dish whose lookup fails on the network");

    expect(result).toBeNull();
  });

  it("returns null, not a throw, on a non-ok response (e.g. rate limited)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));

    const provider = createPexelsProvider("test-key");
    const result = await provider.resolve("a dish whose lookup gets rate limited");

    expect(result).toBeNull();
  });
});
