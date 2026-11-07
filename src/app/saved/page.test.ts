// The Saved page: a fresh user sees an empty state, each user sees only their
// own rows, a recipe that now conflicts with an allergy stays (with a warning),
// hard-excluded places are hidden, and sparse old place rows still render.

import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/test/fakeSupabase";
import { recipe } from "@/test/savedFixtures";

let db = createFakeDb();
let currentUser = "user-1";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => db.clientFor(currentUser),
  getUser: async () => ({ id: currentUser }),
}));
vi.mock("@/lib/env", () => ({ isSupabaseConfigured: true, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
vi.mock("next/navigation", () => ({ redirect: () => undefined, useRouter: () => ({ refresh: () => undefined }), usePathname: () => "/saved" }));

import SavedPage from "./page";
import SavedPlaceCard from "./SavedPlaceCard";
import SavedRecipeCard from "./SavedRecipeCard";

type AnyEl = ReactElement<Record<string, unknown> & { children?: ReactNode }>;
function walk(node: ReactNode, visit: (el: AnyEl) => void) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node && typeof node === "object" && "props" in node) {
    const el = node as AnyEl;
    visit(el);
    walk(el.props.children, visit);
  }
}
const find = (tree: ReactNode, type: unknown) => {
  const found: AnyEl[] = [];
  walk(tree, (el) => el.type === type && found.push(el));
  return found;
};
const text = (tree: ReactNode) => {
  const out: string[] = [];
  const collect = (n: ReactNode) => {
    if (Array.isArray(n)) return n.forEach(collect);
    if (typeof n === "string") out.push(n);
    else if (n && typeof n === "object" && "props" in n) collect((n as AnyEl).props.children);
  };
  collect(tree);
  return out.join(" ");
};
const render = (tab?: string) => SavedPage({ searchParams: Promise.resolve(tab ? { tab } : {}) });

const row = (user: string, extra: Record<string, unknown>) => ({ user_id: user, ...extra });

beforeEach(() => {
  db = createFakeDb();
  currentUser = "user-1";
});

describe("Saved page", () => {
  it("a fresh user sees an empty state in both sections, and no cards", async () => {
    for (const tab of [undefined, "places"]) {
      const tree = await render(tab);
      expect(find(tree, SavedRecipeCard)).toHaveLength(0);
      expect(find(tree, SavedPlaceCard)).toHaveLength(0);
      expect(text(tree)).toContain("Tap the bookmark");
    }
  });

  it("shows a saved recipe from its stored shape, with no regeneration", async () => {
    db.seed("saved_recipes", row("user-1", { recipe_key: "k1", recipe: recipe() }));
    const cards = find(await render(), SavedRecipeCard);
    expect(cards).toHaveLength(1);
    expect(cards[0].props.recipe).toEqual(recipe());
  });

  it("keeps a recipe that now conflicts with a newly-added allergy, and flags it", async () => {
    db.seed("saved_recipes", row("user-1", { recipe_key: "k1", recipe: recipe() }));
    expect((find(await render(), SavedRecipeCard)[0].props.flags as { allergies: string[] }).allergies).toEqual([]);

    db.seed("profiles", { id: "user-1", allergies: ["Peanuts"] }); // added after saving
    const card = find(await render(), SavedRecipeCard)[0];
    expect(card.props.flags).toEqual({ allergies: ["Peanuts"], dislikes: [] });
    // Rendered: a clear warning, recipe text untouched.
    const html = text(SavedRecipeCard(card.props as never));
    expect(html).toContain("May not match your current profile");
    expect(html.toLowerCase()).toContain("peanuts");
    expect(html).toContain("Peanut Noodle Bowl");
  });

  it("a recipe with no conflict shows no warning, and a dislike only a light note", () => {
    const props = { id: "1", recipe: recipe(), savedAt: null };
    expect(text(SavedRecipeCard({ ...props, flags: { allergies: [], dislikes: [] } }))).not.toContain("May not match");
    const light = text(SavedRecipeCard({ ...props, flags: { allergies: [], dislikes: ["Scallions"] } }));
    expect(light).toContain("May no longer fit your preferences");
    expect(light).not.toContain("May not match your current profile");
  });

  it("isolates users: each sees only their own saved items", async () => {
    db.seed("saved_recipes", row("user-2", { recipe_key: "k2", recipe: recipe({ title: "Theirs" }) }));
    db.seed("saved_places", row("user-2", { provider: "google_places", place_id: "p-theirs", name: "Their Place" }));
    db.seed("saved_recipes", row("user-1", { recipe_key: "k1", recipe: recipe({ title: "Mine" }) }));

    const mine = await render();
    expect(find(mine, SavedRecipeCard).map((c) => (c.props.recipe as { title: string }).title)).toEqual(["Mine"]);
    expect(find(await render("places"), SavedPlaceCard)).toHaveLength(0);

    currentUser = "user-2";
    expect(find(await render("places"), SavedPlaceCard).map((c) => (c.props.place as { name: string }).name)).toEqual(["Their Place"]);
  });

  it("restores saved places, including sparse old rows with only an id and a name", async () => {
    db.seed("saved_places", row("user-1", { provider: "google_places", place_id: "p1", name: "Full", maps_url: "https://maps.example/1", look_for: "A bowl." }));
    db.seed("saved_places", row("user-1", { provider: "google_places", place_id: "p2", name: "Sparse" }));
    const cards = find(await render("places"), SavedPlaceCard);
    expect(cards.map((c) => (c.props.place as { name: string }).name).sort()).toEqual(["Full", "Sparse"]);
    const sparse = cards.find((c) => (c.props.place as { name: string }).name === "Sparse")!;
    const html = text(SavedPlaceCard(sparse.props as never));
    expect(html).toContain("Sparse");
    expect(html).not.toContain("What to look for");
  });

  it("hides a saved place that is hard-excluded even if a stale row remains, but not a soft-downranked one", async () => {
    db.seed("saved_places", row("user-1", { provider: "google_places", place_id: "p1", name: "Excluded" }));
    db.seed("saved_places", row("user-1", { provider: "google_places", place_id: "p2", name: "Downranked" }));
    db.seed("place_feedback", row("user-1", { provider: "google_places", place_id: "p1", action: "exclude" }));
    db.seed("place_feedback", row("user-1", { provider: "google_places", place_id: "p2", action: "downrank" }));
    const names = find(await render("places"), SavedPlaceCard).map((c) => (c.props.place as { name: string }).name);
    expect(names).toEqual(["Downranked"]);
  });

  it("withholds saved guidance that now names a current allergen, and never claims a place is allergy-safe", async () => {
    db.seed("profiles", { id: "user-1", allergies: ["Peanuts"] });
    db.seed("saved_places", row("user-1", { provider: "google_places", place_id: "p1", name: "Noodles", look_for: "A peanut noodle bowl." }));
    db.seed("saved_places", row("user-1", { provider: "google_places", place_id: "p2", name: "Grill", look_for: "A grilled chicken bowl." }));
    const tree = await render("places");
    const shown = Object.fromEntries(find(tree, SavedPlaceCard).map((c) => [(c.props.place as { name: string }).name, c.props.showGuidance]));
    expect(shown).toEqual({ Noodles: false, Grill: true });
    expect(text(tree).toLowerCase()).not.toMatch(/allergy[- ]safe|allergen[- ]free|safe for/);
    expect(text(tree)).toContain("check ingredients with the restaurant");
  });

  it("the place card places the exclusion-safe text in place: hidden guidance says so, keeps the place", () => {
    const parsed = { place_id: "p", name: "Noodles", address: null, category: null, maps_url: null, website_url: null, look_for: "A peanut noodle bowl.", saved_at: null };
    const html = text(SavedPlaceCard({ place: parsed, showGuidance: false }));
    expect(html).toContain("Noodles");
    expect(html).toContain("Food suggestion hidden");
    expect(html).not.toContain("peanut noodle bowl");
  });
});
