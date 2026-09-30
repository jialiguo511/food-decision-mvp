import { describe, expect, it } from "vitest";
import { baseDefaults, rememberedDefaults } from "./rememberedDefaults";

const cook = (o: Record<string, unknown> = {}) => ({
  decision_mode: "cook",
  cook_minutes: 45,
  hunger: "very_hungry",
  effort: "minimal",
  shopping: "can_buy",
  craving: "ramen",
  ingredients_on_hand: ["Chicken"],
  budget_override_usd: 8,
  ...o,
});
const order = (o: Record<string, unknown> = {}) => ({
  decision_mode: "order",
  hunger: "light",
  craving_category: "fresh_light",
  craving_note: "sushi",
  method: "pickup",
  meal_budget: "under_15",
  travel_willingness: "no_preference",
  ...o,
});

describe("rememberedDefaults", () => {
  it("gives a brand-new user the plain defaults", () => {
    expect(rememberedDefaults([], 30)).toEqual(baseDefaults(30));
    expect(baseDefaults(30).mode).toBe("cook");
  });

  it("skips unreadable rows instead of trusting them", () => {
    expect(rememberedDefaults([null, { junk: true }, "x"], 30)).toEqual(baseDefaults(30));
  });

  it("opens on the most recently used mode", () => {
    expect(rememberedDefaults([order(), cook()], 30).mode).toBe("order");
  });

  it("remembers cook hunger/effort/budget but never tonight's food, craving, or cook minutes", () => {
    const { cook: c } = rememberedDefaults([cook()], 30);
    expect(c).toMatchObject({ hunger: "very_hungry", effort: "minimal", budget_override_usd: 8, cook_minutes: 30 });
    expect(c.craving).toBeNull();
    expect(c.ingredients_on_hand).toEqual([]);
    expect(c.shopping).toBe("can_buy");
    expect(c.minimize_purchases).toBeUndefined();
  });

  it("keeps a $0 budget override as $0, not 'usual'", () => {
    expect(rememberedDefaults([cook({ budget_override_usd: 0 })], 30).cook.budget_override_usd).toBe(0);
  });

  it("takes the budget from the latest session that allowed shopping", () => {
    const inventory = cook({ shopping: "inventory_only", budget_override_usd: 3, hunger: "light" });
    const { cook: c } = rememberedDefaults([inventory, cook({ budget_override_usd: 12 })], 30);
    expect(c.budget_override_usd).toBe(12);
    expect(c.hunger).toBe("light"); // hunger still from the latest cook session
    expect(c.shopping).toBe("can_buy"); // never restores "Use what I have"
    expect(rememberedDefaults([inventory], 30).cook.budget_override_usd).toBeNull();
  });

  it("keeps each mode's memory separate", () => {
    const d = rememberedDefaults([order(), cook({ hunger: "light" })], 30);
    expect(d.order.hunger).toBe("light");
    expect(d.cook.hunger).toBe("light");
    const d2 = rememberedDefaults([order({ hunger: "very_hungry" })], 30);
    expect(d2.cook.hunger).toBe("normal"); // order never leaks into cook
    expect(d2.store_snack.hunger).toBe("normal");
  });

  it("remembers order method/budget but not the craving or the nearby flag", () => {
    const d = rememberedDefaults([order({ nearby: true, method: "eat_nearby", travel_willingness: "walkable" })], 30);
    expect(d.order).toMatchObject({ method: "eat_nearby", meal_budget: "under_15", travel_willingness: "walkable" });
    expect(d.order.craving_category).toBe("no_preference");
    expect(d.order.craving_note).toBeNull();
    expect(d.order.nearby).toBeUndefined();
  });

  it("takes travel only from an Eat nearby session, not delivery/pickup", () => {
    const pickup = order({ travel_willingness: "walkable" }); // inert value on a pickup row
    expect(rememberedDefaults([pickup], 30).order.travel_willingness).toBe("no_preference");
    const nearby = order({ method: "eat_nearby", travel_willingness: "nearby" });
    expect(rememberedDefaults([pickup, nearby], 30).order.travel_willingness).toBe("nearby");
    expect(rememberedDefaults([pickup, nearby], 30).order.method).toBe("pickup");
  });

  it("reads legacy cook rows saved before decision_mode/shopping existed", () => {
    const legacy = { cook_minutes: 30, hunger: "light", effort: "some", craving: null, ingredients_on_hand: [], budget_override_usd: null };
    const d = rememberedDefaults([legacy], 30);
    expect(d.mode).toBe("cook");
    expect(d.cook.hunger).toBe("light");
  });
});
