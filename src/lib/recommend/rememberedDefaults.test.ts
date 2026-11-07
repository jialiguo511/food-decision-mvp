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
  it("gives a brand-new user nothing: every stable Cook answer unanswered, no usual budget", () => {
    const d = rememberedDefaults([]);
    expect(d).toEqual(baseDefaults());
    expect(d.cook).toMatchObject({ cook_minutes: null, effort: null, shopping: null, budget_override_usd: null });
    expect(d.budgetUsual).toBeNull();
    expect(d.mode).toBe("cook");
    expect(d.remembered).toEqual({ cook: false, order: false, store_snack: false });
  });

  it("skips unreadable rows instead of trusting them", () => {
    expect(rememberedDefaults([null, { junk: true }, "x"])).toEqual(baseDefaults());
  });

  it("opens on the most recently used mode", () => {
    expect(rememberedDefaults([order(), cook()]).mode).toBe("order");
  });

  it("marks only modes with a real past session as remembered", () => {
    expect(rememberedDefaults([order()]).remembered).toEqual({ cook: false, order: true, store_snack: false });
    expect(rememberedDefaults([order(), cook()]).remembered).toEqual({ cook: true, order: true, store_snack: false });
  });

  describe("Cook: stable answers are remembered, momentary ones are not", () => {
    it("remembers time, effort, shopping mode, hunger and the budget — from a real session", () => {
      const { cook: c, budgetUsual } = rememberedDefaults([cook()]);
      expect(c).toMatchObject({ cook_minutes: 45, effort: "minimal", shopping: "can_buy", hunger: "very_hungry", budget_override_usd: 8 });
      expect(budgetUsual).toEqual({ value: 8, source: "last_time" });
    });

    it("never remembers the craving or tonight's foods", () => {
      const { cook: c } = rememberedDefaults([cook()]);
      expect(c.craving).toBeNull();
      expect(c.ingredients_on_hand).toEqual([]);
      expect(c.minimize_purchases).toBeUndefined();
    });

    it("remembers 'Use what I have' as the shopping mode — with its foods empty, so it is asked again", () => {
      const { cook: c } = rememberedDefaults([cook({ shopping: "inventory_only", budget_override_usd: 0 })]);
      expect(c.shopping).toBe("inventory_only");
      expect(c.ingredients_on_hand).toEqual([]);
    });

    it("a $0 budget is a real answer, not 'unset'", () => {
      const d = rememberedDefaults([cook({ budget_override_usd: 0 })]);
      expect(d.cook.budget_override_usd).toBe(0);
      expect(d.budgetUsual).toEqual({ value: 0, source: "last_time" });
    });

    it("takes the budget from the latest session that allowed shopping, not an inventory-only one", () => {
      const inventory = cook({ shopping: "inventory_only", budget_override_usd: 3, hunger: "light" });
      const d = rememberedDefaults([inventory, cook({ budget_override_usd: 12 })]);
      expect(d.cook.budget_override_usd).toBe(12);
      expect(d.cook.hunger).toBe("light"); // everything else from the latest cook session
      expect(d.cook.shopping).toBe("inventory_only");
      expect(rememberedDefaults([inventory]).budgetUsual).toBeNull(); // no buying session → no usual
    });

    it("a session that only said 'use my profile budget' (null) proves no usual", () => {
      const d = rememberedDefaults([cook({ budget_override_usd: null })]);
      expect(d.budgetUsual).toBeNull();
      expect(d.cook.budget_override_usd).toBeNull();
    });
  });

  describe("provenance: Profile (explicit) beats a remembered value; neither means nothing", () => {
    it("an explicit Profile time and budget are the starting point, labelled as the user's", () => {
      const d = rememberedDefaults([], { cookMinutes: 20, budget: 15 });
      expect(d.cook).toMatchObject({ cook_minutes: 20, budget_override_usd: 15 });
      expect(d.budgetUsual).toEqual({ value: 15, source: "profile" });
    });

    it("the Profile wins over what was chosen last time", () => {
      const d = rememberedDefaults([cook({ cook_minutes: 45, budget_override_usd: 8 })], { cookMinutes: 20, budget: 15 });
      expect(d.cook).toMatchObject({ cook_minutes: 20, budget_override_usd: 15 });
      expect(d.budgetUsual?.source).toBe("profile");
    });

    it("with no Profile value, last time's is used and labelled as last time", () => {
      const d = rememberedDefaults([cook({ cook_minutes: 45, budget_override_usd: 8 })], { cookMinutes: null, budget: null });
      expect(d.cook).toMatchObject({ cook_minutes: 45, budget_override_usd: 8 });
      expect(d.budgetUsual?.source).toBe("last_time");
    });

    it("no system fallback ever appears: no $12, no 30 min, anywhere in a new user's defaults", () => {
      const json = JSON.stringify(rememberedDefaults([], { cookMinutes: null, budget: null }));
      expect(json).not.toContain("\"cook_minutes\":30");
      expect(json).not.toContain("12");
    });
  });

  it("keeps each mode's memory separate", () => {
    const d = rememberedDefaults([order(), cook({ hunger: "light" })]);
    expect(d.order.hunger).toBe("light");
    expect(d.cook.hunger).toBe("light");
    const d2 = rememberedDefaults([order({ hunger: "very_hungry" })]);
    expect(d2.cook.hunger).toBe("normal"); // order never leaks into cook
    expect(d2.cook.effort).toBeNull();
    expect(d2.store_snack.hunger).toBe("normal");
  });

  it("remembers order method/budget but not the craving or the nearby flag", () => {
    const d = rememberedDefaults([order({ nearby: true, method: "eat_nearby", travel_willingness: "walkable" })]);
    expect(d.order).toMatchObject({ method: "eat_nearby", meal_budget: "under_15", travel_willingness: "walkable" });
    expect(d.order.craving_category).toBe("no_preference");
    expect(d.order.craving_note).toBeNull();
    expect(d.order.nearby).toBeUndefined();
  });

  it("takes travel from an Eat nearby or Pickup session, not delivery", () => {
    const delivery = order({ method: "delivery", travel_willingness: "walkable" }); // inert value on a delivery row
    expect(rememberedDefaults([delivery]).order.travel_willingness).toBe("no_preference");
    const pickup = order({ method: "pickup", travel_willingness: "worth_a_trip" });
    expect(rememberedDefaults([delivery, pickup]).order.travel_willingness).toBe("worth_a_trip");
    const nearby = order({ method: "eat_nearby", travel_willingness: "nearby" });
    expect(rememberedDefaults([delivery, nearby]).order.travel_willingness).toBe("nearby");
    expect(rememberedDefaults([delivery, nearby]).order.method).toBe("delivery");
  });

  it("reads legacy cook rows saved before decision_mode/shopping existed", () => {
    const legacy = { cook_minutes: 30, hunger: "light", effort: "some", craving: null, ingredients_on_hand: [], budget_override_usd: null };
    const d = rememberedDefaults([legacy]);
    expect(d.mode).toBe("cook");
    expect(d.cook.hunger).toBe("light");
    expect(d.cook.shopping).toBe("can_buy"); // the legacy shim's own meaning, from a real row
  });
});
