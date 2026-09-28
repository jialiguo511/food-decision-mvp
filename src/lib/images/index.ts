import { createPexelsProvider } from "./pexels";
import { noImageProvider, type ImageProvider } from "./provider";

export type { ImageProvider, ImageResult } from "./provider";

/** Picks the active ImageProvider from server config. Defaults to reading
 *  `PEXELS_API_KEY` from the environment; the parameter exists so tests can
 *  exercise the "no key configured" path without touching process.env. No
 *  key -> the no-op provider, so a missing/unset key degrades to "no image"
 *  everywhere instead of the route failing. */
export function resolveImageProvider(apiKey: string | undefined = process.env.PEXELS_API_KEY): ImageProvider {
  return apiKey ? createPexelsProvider(apiKey) : noImageProvider;
}
