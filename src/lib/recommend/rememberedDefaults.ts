// What Home's chips start on. Derived from the user's recent decision_sessions
// contexts — the history already written on every "Find my meal" — so there is
// no second store to keep in sync. Each mode is remembered separately, so
// nothing from one mode reaches another.
//
// Defaults only: every value is an ordinary form value the user can change
// before generating. Validated behavior? No — this is a hypothesis that last
// use predicts this use (PERSONALIZATION.md → routine memory, v0).
//
// Deliberately NOT remembered, because they describe one meal rather than a
// habit: cravings, "what do you have right now" foods (never persisted — see
// CLAUDE.md, Kitchen staples vs. today's food), "Use what I have" and its
// "fewest items" fallback, the nearby request flag, and cook minutes (which
// stays the Profile's explicit default rather than being overridden by
// inference).

import { DEFAULT_MEAL_BUDGET, DEFAULT_TRAVEL_WILLINGNESS } from "../options";
import type { DecisionContext, DecisionMode, MealContext, OrderContext, StoreSnackContext } from "../types";
import { parseStoredContext } from "./session";

export type FormDefaults = {
  /** The mode to open on: the most recently used, or "cook" for a new user. */
  mode: DecisionMode;
  cook: MealContext;
  order: OrderContext;
  store_snack: StoreSnackContext;
};

/** What a brand-new user (no sessions) sees. */
export function baseDefaults(usualCookMinutes: number): FormDefaults {
  return {
    mode: "cook",
    cook: {
      decision_mode: "cook",
      cook_minutes: usualCookMinutes,
      hunger: "normal",
      effort: "some",
      shopping: "can_buy",
      craving: null,
      ingredients_on_hand: [],
      // null means "my usual" (the Profile budget), so the budget card stays collapsed.
      budget_override_usd: null,
    },
    order: {
      decision_mode: "order",
      hunger: "normal",
      craving_category: "no_preference",
      craving_note: null,
      method: "delivery",
      meal_budget: DEFAULT_MEAL_BUDGET,
      travel_willingness: DEFAULT_TRAVEL_WILLINGNESS,
    },
    store_snack: {
      decision_mode: "store_snack",
      hunger: "normal",
      craving_type: "anything",
    },
  };
}

/** `contexts` are raw stored contexts, newest first. Anything unreadable is
 *  skipped rather than trusted. */
export function rememberedDefaults(contexts: readonly unknown[], usualCookMinutes: number): FormDefaults {
  const defaults = baseDefaults(usualCookMinutes);
  const parsed: DecisionContext[] = [];
  for (const raw of contexts) {
    const result = parseStoredContext(raw);
    if (result.success) parsed.push(result.data);
  }

  if (parsed.length > 0) defaults.mode = parsed[0].decision_mode;

  const cook = parsed.find((c): c is MealContext => c.decision_mode === "cook");
  if (cook) {
    defaults.cook.hunger = cook.hunger;
    defaults.cook.effort = cook.effort;
  }
  // The budget only means something when shopping is allowed, so it comes
  // from the latest such session — a "Use what I have" session carries none.
  const shopped = parsed.find((c): c is MealContext => c.decision_mode === "cook" && c.shopping === "can_buy");
  if (shopped) defaults.cook.budget_override_usd = shopped.budget_override_usd;

  const order = parsed.find((c): c is OrderContext => c.decision_mode === "order");
  if (order) {
    defaults.order.hunger = order.hunger;
    defaults.order.method = order.method;
    defaults.order.meal_budget = order.meal_budget;
  }
  // Travel is only ever asked for Eat nearby, so only an Eat nearby session
  // can say anything about it — never a delivery/pickup one.
  const nearby = parsed.find((c): c is OrderContext => c.decision_mode === "order" && c.method === "eat_nearby");
  if (nearby) defaults.order.travel_willingness = nearby.travel_willingness;

  const snack = parsed.find((c): c is StoreSnackContext => c.decision_mode === "store_snack");
  if (snack) defaults.store_snack.hunger = snack.hunger;

  return defaults;
}
