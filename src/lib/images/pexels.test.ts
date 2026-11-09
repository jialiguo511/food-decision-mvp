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

  it("returns the best-matching image and attribution, and caches it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photos: [
          {
            // Pexels' own top hit — a related but wrong dish, same as the
            // reported bug. Must be skipped in favor of the real match below.
            src: {
              landscape: "https://images.pexels.com/wrong-landscape.jpg",
              large: "https://images.pexels.com/wrong-large.jpg",
            },
            photographer: "Wrong Match",
            photographer_url: "https://www.pexels.com/@wrong",
            url: "https://www.pexels.com/photo/0",
            alt: "Breakfast bowl with eggs, avocado, and fruit",
          },
          {
            src: {
              landscape: "https://images.pexels.com/photo-1-landscape.jpg",
              large: "https://images.pexels.com/photo-1-large.jpg",
            },
            photographer: "Jane Doe",
            photographer_url: "https://www.pexels.com/@jane",
            url: "https://www.pexels.com/photo/1",
            alt: "Peanut butter toast with sliced banana",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createPexelsProvider("test-key");
    const result = await provider.resolve("Peanut   Butter Toast");

    expect(result).toEqual({
      url: "https://images.pexels.com/photo-1-landscape.jpg",
      photographerName: "Jane Doe",
      photographerUrl: "https://www.pexels.com/@jane",
      sourceUrl: "https://www.pexels.com/photo/1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A differently-cased/spaced request for the same dish hits the cache,
    // not Pexels again.
    await provider.resolve("peanut  butter   toast");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when Pexels has candidates but none are relevant enough", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          photos: [
            { src: { landscape: "https://images.pexels.com/a.jpg", large: "" }, photographer: "A", photographer_url: "https://pexels.com/@a", url: "https://pexels.com/photo/a", alt: "Grilled steak with roasted vegetables" },
          ],
        }),
      }),
    );

    const provider = createPexelsProvider("test-key");
    const result = await provider.resolve("apple oatmeal bowl");

    expect(result).toBeNull();
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

  it("concurrent lookups of the same phrase share ONE Pexels request", async () => {
    let release: (v: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createPexelsProvider("test-key");
    const a = provider.resolve("Concurrent Lentil Soup");
    const b = provider.resolve("concurrent  lentil soup");
    const c = createPexelsProvider("test-key").resolve("concurrent lentil soup");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release({ ok: true, json: async () => ({ photos: [{ src: { landscape: "https://x/l.jpg", large: "https://x/L.jpg" }, photographer: "P", photographer_url: "u", url: "p", alt: "Lentil soup in a bowl" }] }) });
    const results = await Promise.all([a, b, c]);
    expect(results.every((r) => r?.url === "https://x/l.jpg")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not show a sushi photo for a roll-ups query even when Pexels ranks it first", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ photos: [{ src: { landscape: "https://x/sushi.jpg", large: "https://x/s.jpg" }, photographer: "Nadin", photographer_url: "u", url: "p", alt: "Salmon nigiri sushi with cucumber" }] }) }));
    expect(await createPexelsProvider("test-key").resolve("smoked salmon cucumber roll-ups sushi-check")).toBeNull();
  });
});
