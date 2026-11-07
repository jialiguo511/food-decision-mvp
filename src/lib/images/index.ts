import { createPexelsProvider } from "./pexels";
import { noImageProvider, type ImageProvider } from "./provider";

export type { ImageProvider, ImageResult, RecipeImageResult } from "./provider";

/** Picks the active ImageProvider from server config. Defaults to reading
 *  `PEXELS_API_KEY` from the environment; the parameter exists so tests can
 *  exercise the "no key configured" path without touching process.env. No
 *  key -> the no-op provider, so a missing/unset key degrades to "no image"
 *  everywhere instead of the route failing. */
export function resolveImageProvider(apiKey: string | undefined = process.env.PEXELS_API_KEY): ImageProvider {
  if (apiKey) return createPexelsProvider(apiKey);
  warnNoKeyOnce();
  return noImageProvider;
}

let warned = false;
/** Without a key every card shows the no-photo state — say so once, so "no
 *  images" is diagnosable instead of looking like a bug. */
function warnNoKeyOnce() {
  if (warned) return;
  warned = true;
  console.warn("[images] PEXELS_API_KEY isn't set, so recipe cards show the no-photo state. Add it to .env.local to get photos.");
}
