// One recipe card's image, server-side: a relevant real photo if there is one,
// else a previously generated picture, else generate one — once — and keep it.
// Called from /api/image AFTER the recipe text is already on screen, so it can
// never delay or fail a recommendation, and returns null (the card's quiet
// no-photo band) on any failure.
//
// "Generate once, reuse": generated images live in a shared cache keyed by the
// recipe's identity (recipeKey.ts) — a table row plus a file in Storage. A
// second request for the same dish, from anyone, is a lookup and zero
// generation. Concurrent requests for the same key in one server process share
// one generation.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CookRecommendation } from "../types";
import { buildImagePrompt, type ImageGenerator } from "./generated";
import type { ImageProvider, RecipeImageResult } from "./provider";
import { IMAGE_PROMPT_VERSION, recipeImageKey } from "./recipeKey";

export const IMAGE_BUCKET = "recipe-images";

/** The shared cache of generated images — a seam so tests (and a later swap of
 *  storage) don't touch Supabase. */
export interface GeneratedImageCache {
  /** Public URL of the cached image for this key, or null on a miss (or any read failure). */
  lookup(key: string): Promise<string | null>;
  /** Stores the image and its metadata; returns its public URL, or null if it couldn't be kept. */
  save(key: string, image: { bytes: Uint8Array; contentType: string; model: string }, title: string): Promise<string | null>;
}

export function createSupabaseImageCache(supabase: SupabaseClient): GeneratedImageCache {
  const publicUrl = (path: string) => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  return {
    async lookup(key) {
      const { data, error } = await supabase.from("recipe_images").select("storage_path").eq("cache_key", key).maybeSingle();
      if (error) {
        console.warn("[images] cache read failed", { code: error.code, message: error.message });
        return null;
      }
      return typeof data?.storage_path === "string" ? publicUrl(data.storage_path) : null;
    },
    async save(key, image, title) {
      const extension = image.contentType === "image/jpeg" ? "jpg" : image.contentType === "image/png" ? "png" : "webp";
      const path = `${key}.${extension}`;
      const upload = await supabase.storage.from(IMAGE_BUCKET).upload(path, image.bytes, {
        contentType: image.contentType,
        cacheControl: "31536000",
        upsert: false,
      });
      // "Already exists" means another request got there first: that file is the cache entry.
      const exists = (upload.error as { statusCode?: string } | null)?.statusCode === "409";
      if (upload.error && !exists) {
        console.warn("[images] couldn't store the generated image", { message: upload.error.message });
        return null;
      }
      const { error } = await supabase
        .from("recipe_images")
        .upsert({ cache_key: key, storage_path: path, model: image.model, prompt_version: IMAGE_PROMPT_VERSION, title: title.slice(0, 120) }, { onConflict: "cache_key", ignoreDuplicates: true });
      if (error) {
        console.warn("[images] couldn't record the generated image", { code: error.code, message: error.message });
        return null;
      }
      return publicUrl(path);
    },
  };
}

/** Counters for this server process, for logs and tests: how often the cache
 *  saved a generation, and how often one was needed or failed. */
export const imageStats = { photo: 0, cache_hit: 0, cache_miss: 0, generated: 0, generation_failed: 0, not_configured: 0 };
export function resetImageStats() {
  for (const k of Object.keys(imageStats) as (keyof typeof imageStats)[]) imageStats[k] = 0;
}

/** One generation per key at a time; what it ended as. */
type Generation = { url: string } | { failed: true } | { limited: true };
const inFlight = new Map<string, Promise<Generation>>();

type Recipe = Pick<CookRecommendation, "title" | "image_query" | "ingredients_on_hand" | "ingredients_needed" | "steps">;

/** Why there is no picture. The card treats these differently: "no_image" is a
 *  settled answer (nothing relevant, or no image source configured — don't ask
 *  again); "generation_failed" is worth a retry (nothing was cached, so a retry
 *  may succeed). Cases that never reach this resolver (not signed in, card not
 *  found) are the route's own "unavailable". */
export type NoImageReason = "no_image" | "generation_failed" | "limit_reached";

export type ImageOutcome = { image: RecipeImageResult } | { none: NoImageReason };

type Deps = {
  photos: ImageProvider;
  cache: GeneratedImageCache;
  generator: ImageGenerator | null;
  /** Asked once, right before a PAID generation starts (never for a photo or a
   *  cache hit, and once per recipe however many cards ask at the same time).
   *  false = today's allowance is used up: nothing is generated. */
  allowGeneration?: () => Promise<boolean>;
};

/** The picture or null — the shape callers that only need "a picture or nothing" use. */
export async function resolveRecipeImage(recipe: Recipe, deps: Deps): Promise<RecipeImageResult | null> {
  const outcome = await resolveRecipeImageOutcome(recipe, deps);
  return "image" in outcome ? outcome.image : null;
}

export async function resolveRecipeImageOutcome(recipe: Recipe, deps: Deps): Promise<ImageOutcome> {
  // 1. A relevant real photo, when one exists. (Pexels' own relevance bar and
  //    24 h cache live in the provider.) Never fatal.
  if (recipe.image_query) {
    try {
      const photo = await deps.photos.resolve(recipe.image_query);
      if (photo) {
        imageStats.photo++;
        return { image: { source: "photo", ...photo } };
      }
    } catch (error) {
      console.warn("[images] photo lookup errored", error instanceof Error ? error.message : error);
    }
  }

  const key = recipeImageKey({ title: recipe.title, ingredients: [...recipe.ingredients_on_hand, ...recipe.ingredients_needed], steps: recipe.steps });
  const short = key.slice(0, 8);

  // 2. Generated before? Free.
  const cached = await deps.cache.lookup(key);
  if (cached) {
    imageStats.cache_hit++;
    console.info("[images] recipe image", { outcome: "cache_hit", key: short });
    return { image: { source: "generated", url: cached } };
  }
  imageStats.cache_miss++;

  // 3. Generate — once — and keep it.
  if (!deps.generator) {
    imageStats.not_configured++;
    console.info("[images] recipe image", { outcome: "cache_miss_no_generator", key: short });
    return { none: "no_image" };
  }
  const generator = deps.generator;
  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async (): Promise<Generation> => {
      const startedAt = performance.now();
      try {
        if (deps.allowGeneration && !(await deps.allowGeneration())) {
          console.info("[images] recipe image", { outcome: "limit_reached", key: short });
          return { limited: true };
        }
        const image = await generator.generate(buildImagePrompt(recipe));
        const ms = Math.round(performance.now() - startedAt);
        if (!image) {
          imageStats.generation_failed++;
          console.warn("[images] recipe image", { outcome: "generation_failed", key: short, duration_ms: ms, model: generator.model });
          return { failed: true };
        }
        const url = await deps.cache.save(key, image, recipe.title);
        imageStats.generated++;
        console.info("[images] recipe image", { outcome: "cache_miss_generated", key: short, duration_ms: ms, bytes: image.bytes.length, model: image.model, stored: url !== null });
        return url ? { url } : { failed: true };
      } catch (error) {
        imageStats.generation_failed++;
        console.warn("[images] recipe image", { outcome: "generation_failed", key: short, error: error instanceof Error ? error.message : String(error) });
        return { failed: true };
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }
  const result = await pending;
  if ("url" in result) return { image: { source: "generated", url: result.url } };
  return { none: "limited" in result ? "limit_reached" : "generation_failed" };
}
