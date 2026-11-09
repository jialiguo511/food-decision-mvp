import { describe, expect, it, vi } from "vitest";
import { ideaImageQueries, resolveIdeaImage } from "./ideaImage";
import type { ImageProvider, ImageResult } from "./provider";

const PHOTO: ImageResult = { url: "https://img/a.jpg", photographerName: "Pat", photographerUrl: "https://p/pat", sourceUrl: "https://p/a" };
const provider = (answers: Record<string, ImageResult | null | Error>): ImageProvider & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    async resolve(q) {
      asked.push(q);
      const a = answers[q];
      if (a instanceof Error) throw a;
      return a ?? null;
    },
  };
};

describe("ideaImageQueries — search words from the card's own title", () => {
  it("the whole dish name, tone words left out", () => {
    expect(ideaImageQueries({ title: "Quick Chicken Rice Bowl" })).toEqual(["chicken rice bowl"]);
    expect(ideaImageQueries({ title: "Light protein smoothie (strawberry)" })).toEqual(["smoothie"]);
  });
  it("then, only if it names more than the dish, the dish before 'with' / 'and'", () => {
    expect(ideaImageQueries({ title: "Cottage cheese with canned tuna and cucumber" })).toEqual(["cottage cheese canned tuna cucumber", "cottage cheese"]);
    expect(ideaImageQueries({ title: "Shrimp and salad plate" })).toEqual(["shrimp salad plate", "shrimp"]);
  });
  it("a title with nothing searchable yields no query", () => {
    expect(ideaImageQueries({ title: "Easy snack" })).toEqual([]);
  });
});

describe("resolveIdeaImage", () => {
  it("stops at the first query that has a relevant photo", async () => {
    const p = provider({ "chicken rice bowl": PHOTO });
    expect(await resolveIdeaImage({ title: "Chicken rice bowl" }, p)).toEqual(PHOTO);
    expect(p.asked).toEqual(["chicken rice bowl"]);
  });
  it("falls back to the broader dish name once — and never a third time", async () => {
    const p = provider({ "cottage cheese": PHOTO });
    expect(await resolveIdeaImage({ title: "Cottage cheese with canned tuna and cucumber" }, p)).toEqual(PHOTO);
    expect(p.asked).toEqual(["cottage cheese canned tuna cucumber", "cottage cheese"]);
  });
  it("no relevant photo means null — no guessing", async () => {
    expect(await resolveIdeaImage({ title: "Greek yogurt cup" }, provider({}))).toBeNull();
  });
  it("a provider that throws is 'no photo', never an error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await resolveIdeaImage({ title: "Greek yogurt cup" }, provider({ "greek yogurt cup": new Error("boom"), "greek yogurt": new Error("boom") }))).toBeNull();
  });
});
