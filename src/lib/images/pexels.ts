// A Pexels-backed ImageProvider — see provider.ts for the swappable
// interface this implements. Server-only: the API key is passed in by the
// caller (see index.ts, which reads it from process.env) and never reaches
// the browser. Any failure mode here — missing key, timeout, rate limit, no
// results, a malformed response — resolves to null rather than throwing: an
// image is decoration, never something the recommendation flow depends on.

import { ONE_DAY_MS, TtlCache } from "./cache";
import type { ImageProvider, ImageResult } from "./provider";
import { normalizeImageQuery } from "./query";
import { selectRelevantPhoto } from "./relevance";

const PEXELS_SEARCH_URL = "https://api.pexels.com/v1/search";
// A small candidate pool, not just the top hit: Pexels' own top result for a
// short food query is often a related-but-wrong dish (e.g. "peanut butter
// toast" surfacing avocado toast), so several candidates are scored by
// relevance below instead of trusting Pexels' first result blindly.
const RESULTS_PER_PAGE = 10;
const REQUEST_TIMEOUT_MS = 5000;

type PexelsPhoto = {
  src: { large: string; landscape: string };
  photographer: string;
  photographer_url: string;
  url: string;
  /** Pexels' own photo description — the only per-photo signal available to
   *  check relevance against image_query without a second API call. */
  alt: string;
};

type PexelsSearchResponse = {
  photos: PexelsPhoto[];
};

// Module-scoped so every createPexelsProvider() call (the route re-resolves
// the provider per request — see index.ts) shares one cache for the life of
// the server process. Keyed on the normalized query only, not the API key:
// this product only ever configures one key at a time. A hit AND a definitive
// "nothing relevant" (null) are cached for 24h. A transient failure (timeout,
// rate limit, network error) is NOT cached — it used to be, which turned one
// bad minute into a day of missing photos for that dish.
const cache = new TtlCache<ImageResult | null>(ONE_DAY_MS);

export function createPexelsProvider(apiKey: string): ImageProvider {
  return {
    async resolve(query: string): Promise<ImageResult | null> {
      const normalized = normalizeImageQuery(query);
      if (!normalized) return null;

      const cached = cache.get(normalized);
      if (cached !== undefined) return cached;

      const result = await fetchFromPexels(apiKey, normalized);
      if (result === FAILED) return null;
      cache.set(normalized, result);
      return result;
    },
  };
}

/** A lookup that didn't complete — as opposed to one that did and found nothing. */
const FAILED = Symbol("failed");

async function fetchFromPexels(apiKey: string, query: string): Promise<ImageResult | null | typeof FAILED> {
  const url = new URL(PEXELS_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", String(RESULTS_PER_PAGE));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Authorization: apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("[images] Pexels request failed", { status: response.status });
      return FAILED;
    }

    const data = (await response.json()) as PexelsSearchResponse;
    // Best-scoring candidate against `query`'s tokens, not just Pexels' own
    // top hit — see relevance.ts. Null here means nothing in the candidate
    // pool reached the relevance bar: a fallback, not a wrong photo.
    const photo = selectRelevantPhoto(query, data.photos ?? [], (candidate) => candidate.alt ?? "");
    if (!photo) {
      // Worth knowing when images look sparse: was the pool empty, or did the
      // relevance bar discard everything? (The alt text is Pexels' own.)
      console.info("[images] no relevant photo", { query, candidates: (data.photos ?? []).length });
      return null;
    }

    return {
      url: photo.src.landscape ?? photo.src.large,
      photographerName: photo.photographer,
      photographerUrl: photo.photographer_url,
      sourceUrl: photo.url,
    };
  } catch (error) {
    console.warn("[images] Pexels request errored", error);
    return FAILED;
  } finally {
    clearTimeout(timeout);
  }
}
