import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildImagePrompt, createOpenAIImageGenerator, IMAGE_SETTINGS, resolveImageGenerator, resolveImageSettings, type ImageGenerator } from "./generated";
import type { ImageProvider } from "./provider";
import { cookingMethod, majorIngredients, normalizeTitle, recipeImageKey } from "./recipeKey";
import { imageStats, resetImageStats, resolveRecipeImage, type GeneratedImageCache } from "./recipeImage";
import { recipe } from "@/test/savedFixtures";

const R = recipe({ title: "Peanut Noodle Bowl", ingredients_on_hand: ["Noodles", "Soy sauce", "Salt"], ingredients_needed: ["Peanut butter", "Scallions"], steps: ["Boil the noodles.", "Whisk the sauce.", "Toss."], image_query: "peanut noodle bowl" });

describe("recipeImageKey — generate once, reuse", () => {
  it("is a sha256 hex string (safe as a file name, can't be steered by user input)", () => {
    expect(recipeImageKey({ title: R.title, ingredients: R.ingredients_needed, steps: R.steps })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the same dish worded or ordered differently is the same image", () => {
    const base = { title: "Peanut Noodle Bowl", ingredients: ["Noodles", "Peanut butter", "Scallions"], steps: ["Boil the noodles."] };
    const key = recipeImageKey(base);
    expect(recipeImageKey({ ...base, title: "Easy peanut noodle bowl!" })).toBe(key);
    expect(recipeImageKey({ ...base, ingredients: ["Scallions", "noodles", "PEANUT BUTTER", "Salt", "olive oil"] })).toBe(key); // order, case, pantry basics
    expect(recipeImageKey({ ...base, steps: ["Boil water.", "Boil the noodles until tender."] })).toBe(key); // same method
  });

  it("different dishes never share an image: another dish, main ingredient, or cooking method", () => {
    const base = { title: "Peanut Noodle Bowl", ingredients: ["Noodles", "Peanut butter"], steps: ["Boil the noodles."] };
    const key = recipeImageKey(base);
    expect(recipeImageKey({ ...base, title: "Chicken Fried Rice" })).not.toBe(key);
    expect(recipeImageKey({ ...base, ingredients: ["Noodles", "Chicken"] })).not.toBe(key);
    expect(recipeImageKey({ ...base, steps: ["Bake until golden."] })).not.toBe(key);
  });

  it("reads the cooking method from the steps; nothing heated is 'assemble'", () => {
    expect(cookingMethod(["Pan-fry the tofu."])).toBe("fry");
    expect(cookingMethod(["Roast at 400°F."])).toBe("bake");
    expect(cookingMethod(["Mix and serve."])).toBe("assemble");
    expect(normalizeTitle("The Best Quick Chicken Bowl")).toBe("chicken bowl");
    expect(majorIngredients(["Salt", "Olive oil", "Tofu", "tofu", "Rice"])).toEqual(["rice", "tofu"]);
  });
});

describe("the picture prompt", () => {
  it("describes the actual recipe — its title, its own ingredients, how it's cooked — and nothing else", () => {
    const prompt = buildImagePrompt(R);
    expect(prompt).toContain("Peanut Noodle Bowl");
    for (const i of ["noodles", "peanut butter", "scallions"]) expect(prompt).toContain(i);
    expect(prompt).not.toMatch(/\bsalt\b|soy sauce/); // pantry basics aren't "visible ingredients"
    expect(prompt).toMatch(/simmered/); // "boil" reads as simmered
    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/no people/i);
    expect(prompt).toMatch(/only this dish/i);
  });

  it("never includes anything the user typed (craving, foods on hand beyond the recipe)", () => {
    expect(buildImagePrompt({ ...R, title: "Tofu Bowl", steps: ["Pan-fry the tofu."], ingredients_on_hand: [], ingredients_needed: ["Tofu"] })).not.toMatch(/noodle|peanut/i);
  });
});

describe("generator settings", () => {
  it("default to the cheapest sensible setup: low quality, landscape, WebP", () => {
    expect(IMAGE_SETTINGS).toMatchObject({ model: "gpt-image-2", size: "1536x1024", quality: "low", format: "webp" });
    expect(resolveImageSettings({ OPENAI_IMAGE_MODEL: "gpt-image-1-mini" }).model).toBe("gpt-image-1-mini");
  });
  it("no key, no generator: recipes without a photo keep the no-photo band", () => {
    expect(resolveImageGenerator({})).toBeNull();
    expect(resolveImageGenerator({ OPENAI_API_KEY: "k" })).not.toBeNull();
  });

  it("sends the configured request and decodes the image; any failure is null, never a throw", async () => {
    const b64 = Buffer.from("fake-webp-bytes").toString("base64");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{ b64_json: b64 }] }), { status: 200 }));
    const generator = createOpenAIImageGenerator("sk-test", resolveImageSettings({}), fetchImpl as never);
    const image = await generator.generate("a dish");
    expect(image).toMatchObject({ contentType: "image/webp", model: "gpt-image-2" });
    expect(Buffer.from(image!.bytes).toString()).toBe("fake-webp-bytes");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "gpt-image-2", size: "1536x1024", quality: "low", output_format: "webp", n: 1 });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of [new Response("{}", { status: 429 }), new Response(JSON.stringify({ data: [] }), { status: 200 })]) {
      expect(await createOpenAIImageGenerator("k", resolveImageSettings({}), (async () => bad) as never).generate("x")).toBeNull();
    }
    const throwing = createOpenAIImageGenerator("k", resolveImageSettings({}), (async () => { throw new Error("offline"); }) as never);
    expect(await throwing.generate("x")).toBeNull();
    warn.mockRestore();
  });
});

describe("resolveRecipeImage — photo → cache → generate, never blocking, never failing", () => {
  const photo = { url: "https://images.pexels.com/p.jpg", photographerName: "Sam", photographerUrl: "https://pexels.com/@sam", sourceUrl: "https://pexels.com/photo/1" };
  let photos: ImageProvider;
  let store: Map<string, string>;
  let cache: GeneratedImageCache;
  let generator: ImageGenerator & { generate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resetImageStats();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    photos = { resolve: vi.fn(async () => null) };
    store = new Map();
    cache = {
      lookup: vi.fn(async (key) => store.get(key) ?? null),
      save: vi.fn(async (key) => {
        const url = `https://cdn.example/${key}.webp`;
        store.set(key, url);
        return url;
      }),
    };
    generator = { model: "gpt-image-2", generate: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp", model: "gpt-image-2" })) };
  });
  afterEach(() => vi.restoreAllMocks());

  it("a relevant real photo wins, and costs no generation (and no cache read)", async () => {
    photos = { resolve: vi.fn(async () => photo) };
    expect(await resolveRecipeImage(R, { photos, cache, generator })).toEqual({ source: "photo", ...photo });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(cache.lookup).not.toHaveBeenCalled();
    expect(imageStats.photo).toBe(1);
  });

  it("cache MISS: generates once, stores it, returns it — and the next request is a cache HIT with zero generation", async () => {
    const first = await resolveRecipeImage(R, { photos, cache, generator });
    expect(first).toMatchObject({ source: "generated", url: expect.stringMatching(/^https:\/\/cdn\.example\/[0-9a-f]{64}\.webp$/) });
    expect(generator.generate).toHaveBeenCalledTimes(1);
    expect(cache.save).toHaveBeenCalledTimes(1);
    expect(imageStats).toMatchObject({ cache_miss: 1, generated: 1, cache_hit: 0 });

    const second = await resolveRecipeImage(R, { photos, cache, generator });
    expect(second).toEqual(first);
    expect(generator.generate).toHaveBeenCalledTimes(1); // not again
    expect(imageStats).toMatchObject({ cache_miss: 1, generated: 1, cache_hit: 1 });
  });

  it("an equivalent recipe (same dish, reworded) reuses the cached image; a different dish generates its own", async () => {
    await resolveRecipeImage(R, { photos, cache, generator });
    await resolveRecipeImage({ ...R, title: "Quick peanut noodle bowl", reason: "x" } as typeof R, { photos, cache, generator });
    expect(generator.generate).toHaveBeenCalledTimes(1);
    await resolveRecipeImage({ ...R, title: "Chicken Fried Rice", ingredients_needed: ["Chicken", "Rice"], ingredients_on_hand: [] }, { photos, cache, generator });
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });

  it("concurrent requests for the same recipe share one generation", async () => {
    await Promise.all([resolveRecipeImage(R, { photos, cache, generator }), resolveRecipeImage(R, { photos, cache, generator }), resolveRecipeImage(R, { photos, cache, generator })]);
    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it("generation failure is null (the quiet no-photo band) — it never throws, and nothing is cached", async () => {
    generator.generate = vi.fn(async () => null);
    expect(await resolveRecipeImage(R, { photos, cache, generator })).toBeNull();
    expect(cache.save).not.toHaveBeenCalled();
    expect(imageStats.generation_failed).toBe(1);
    generator.generate = vi.fn(async () => { throw new Error("boom"); });
    expect(await resolveRecipeImage(R, { photos, cache, generator })).toBeNull();
  });

  it("a photo provider that throws, or a cache that can't store, never fails the card", async () => {
    photos = { resolve: vi.fn(async () => { throw new Error("pexels down"); }) };
    cache.save = vi.fn(async () => null);
    expect(await resolveRecipeImage(R, { photos, cache, generator })).toBeNull();
  });

  it("no generator configured: a miss is simply no image", async () => {
    expect(await resolveRecipeImage(R, { photos, cache, generator: null })).toBeNull();
    expect(imageStats.not_configured).toBe(1);
  });

  it("a slow generation doesn't hold anything else: a cache hit answers while another dish is still generating", async () => {
    let release: () => void = () => {};
    generator.generate = vi.fn(() => new Promise<{ bytes: Uint8Array; contentType: string; model: string }>((resolve) => { release = () => resolve({ bytes: new Uint8Array([1]), contentType: "image/webp", model: "m" }); }));
    const slow = resolveRecipeImage(R, { photos, cache, generator });
    store.set(recipeImageKey({ title: "Toast", ingredients: ["Bread"], steps: ["Toast it."] }), "https://cdn.example/toast.webp");
    const fast = await resolveRecipeImage(recipe({ title: "Toast", ingredients_on_hand: ["Bread"], ingredients_needed: [], steps: ["Toast it."], image_query: null }), { photos, cache, generator });
    expect(fast).toEqual({ source: "generated", url: "https://cdn.example/toast.webp" });
    release();
    expect((await slow)?.source).toBe("generated");
  });
});
