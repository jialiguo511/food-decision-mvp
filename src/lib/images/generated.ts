// AI-generated recipe images — the fallback when no relevant real photo exists.
// Server-only. Order for a recipe card (see recipeImage.ts):
//   1. a relevant real photo            (Pexels, relevance-filtered)
//   2. a previously generated image     (the shared cache: zero cost)
//   3. generate one, store it, reuse it (this file — only on a cache miss)
//   4. nothing: the card shows its quiet no-photo band
// Restaurants never come here: a generated "photo" of a real place would be a
// fabrication, so they use the place's own Google photo or a neutral placeholder.
//
// Everything model-specific lives behind ImageGenerator, so the model, size or
// vendor can change without touching a caller. Settings are env-overridable.

import type { CookRecommendation } from "../types";
import { majorIngredients, cookingMethod } from "./recipeKey";

export type GeneratedImage = { bytes: Uint8Array; contentType: string; model: string };

export interface ImageGenerator {
  readonly model: string;
  /** null on any failure — an image is decoration, never something a request fails over. */
  generate(prompt: string): Promise<GeneratedImage | null>;
}

/** Defaults chosen for cost: the lowest quality tier, landscape (the card's
 *  shape — no wasted pixels), and WebP (a fraction of PNG's bytes). OpenAI's
 *  published price for this model at low quality / 1536×1024 is about $0.005 an
 *  image (plus a negligible text-input charge). Override any of it in the env. */
export const IMAGE_SETTINGS = {
  model: "gpt-image-2",
  size: "1536x1024",
  quality: "low",
  format: "webp",
  compression: 80,
  timeoutMs: 60_000,
} as const;

export function resolveImageSettings(env: Record<string, string | undefined> = process.env) {
  return {
    ...IMAGE_SETTINGS,
    model: env.OPENAI_IMAGE_MODEL?.trim() || IMAGE_SETTINGS.model,
    size: env.OPENAI_IMAGE_SIZE?.trim() || IMAGE_SETTINGS.size,
    quality: env.OPENAI_IMAGE_QUALITY?.trim() || IMAGE_SETTINGS.quality,
  };
}

/** The picture prompt, built ONLY from the recipe itself: its title, its main
 *  ingredients and how it's cooked. Nothing the user typed, no ingredient the
 *  recipe doesn't list — an image must not show food that isn't in the dish. */
export function buildImagePrompt(recipe: Pick<CookRecommendation, "title" | "ingredients_on_hand" | "ingredients_needed" | "steps">): string {
  const ingredients = majorIngredients([...recipe.ingredients_on_hand, ...recipe.ingredients_needed], 8);
  const method = cookingMethod(recipe.steps);
  const how =
    method === "assemble" ? "freshly assembled, nothing cooked" : `${method === "fry" ? "pan-fried or sautéed" : method === "boil" ? "simmered" : method === "bake" ? "baked or roasted" : method === "grill" ? "grilled or seared" : method === "steam" ? "steamed" : method === "toast" ? "toasted" : method === "blend" ? "blended" : "microwaved"}`;
  return [
    `A realistic overhead food photograph of a home-cooked dish: ${recipe.title}.`,
    ingredients.length > 0 ? `The visible ingredients are only: ${ingredients.join(", ")}.` : "",
    `It is ${how}, plated simply in a bowl or on a plate on a plain table, with natural soft daylight and appetizing everyday home cooking, not a restaurant.`,
    "Show only this dish and its listed ingredients — no other foods or garnishes.",
    "No text, no logos, no watermark, no people, no hands, and no cutlery or utensils covering the food.",
  ]
    .filter(Boolean)
    .join(" ");
}

type FetchLike = typeof fetch;

export function createOpenAIImageGenerator(apiKey: string, settings = resolveImageSettings(), fetchImpl: FetchLike = fetch): ImageGenerator {
  return {
    model: settings.model,
    async generate(prompt) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
      try {
        const response = await fetchImpl("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: settings.model,
            prompt,
            n: 1,
            size: settings.size,
            quality: settings.quality,
            output_format: settings.format,
            output_compression: settings.compression,
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          // The body can echo the prompt; the status and error type are enough.
          const detail = await response.json().catch(() => null);
          console.warn("[images] generation request failed", { status: response.status, type: detail?.error?.type ?? null, code: detail?.error?.code ?? null });
          return null;
        }
        const data = (await response.json()) as { data?: { b64_json?: string }[] };
        const b64 = data.data?.[0]?.b64_json;
        if (!b64) return null;
        return { bytes: Uint8Array.from(Buffer.from(b64, "base64")), contentType: `image/${settings.format}`, model: settings.model };
      } catch (error) {
        console.warn("[images] generation errored", error instanceof Error ? error.message : error);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The configured generator, or null when no key is set (then recipes without
 *  a relevant photo simply show the no-photo band, exactly as before). */
export function resolveImageGenerator(env: Record<string, string | undefined> = process.env): ImageGenerator | null {
  const key = env.OPENAI_API_KEY?.trim();
  return key ? createOpenAIImageGenerator(key, resolveImageSettings(env)) : null;
}
