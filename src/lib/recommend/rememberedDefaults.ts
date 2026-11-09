// What Home's answers start on — and where each starting value came from.
//
// Every starting value has exactly one of three origins, and only the first two
// may ever be shown as "yours":
//   1. explicit  — the user set it in Me (the Profile's usual cook time/budget);
//   2. remembered — they actually chose it in a real earlier session (read from
//      the decision_sessions history already written on every request, so there
//      is no second store to keep in sync);
//   3. nothing   — null. The question starts unanswered and the user answers it.
// A system fallback is a fourth thing and never appears here: it is not a
// starting value, only something the server may need for a stored session that
// predates a field (SYSTEM_FALLBACKS).
//
// What carries over for Cook — the "stable" answers a person reuses: cook time,
// effort, shopping mode ("Use what I have" / "I can buy a few things"), and the
// budget when buying is allowed. What does not — the "momentary" ones: the
// craving and tonight's foods (never persisted; see CLAUDE.md → Kitchen staples
// vs. today's food). Hunger carries as before (an existing, intentional rule).
// A restored "Use what I have" stays strict: its foods start empty, so Home
// asks what you have right now before it runs.
//
// Precedence when both exist: an explicit Profile value beats a remembered one
// (explicit beats inferred — PERSONALIZATION.md).
//
// Defaults only: every value is an ordinary answer the user can change before
// generating. This is a hypothesis that last use predicts this use, not
// validated behavior.

import { asksTravel } from "../places/travel";
import { DEFAULT_MEAL_BUDGET, DEFAULT_TRAVEL_WILLINGNESS } from "../options";
import type { CookForm, DecisionContext, DecisionMode, MealContext, OrderContext, StoreSnackContext } from "../types";
import { parseStoredContext } from "./session";

/** A budget the user can honestly be offered back as "My usual" / "Last time". */
export type BudgetUsual = { value: number; source: "profile" | "last_time" };

export type FormDefaults = {
  /** The mode to open on: the most recently used, or "cook" for a new user. */
  mode: DecisionMode;
  cook: CookForm;
  order: OrderContext;
  store_snack: StoreSnackContext;
  /** The budget that may be called "My usual" (Profile) or "Last time" (a real
   *  earlier Cook request that allowed buying). null = none exists, so Home
   *  shows plain choices and claims nothing. */
  budgetUsual: BudgetUsual | null;
  /** Which modes have a real past session behind them (vs. plain defaults).
   *  Home offers a mode's own summary screen only for these — a brand-new user
   *  has never told us anything about a mode. */
  remembered: Record<DecisionMode, boolean>;
};

/** What the Profile's explicit Cook defaults are (null = the user hasn't set one). */
export type ProfileCookDefaults = { cookMinutes: number | null; budget: number | null };

const NO_PROFILE_DEFAULTS: ProfileCookDefaults = { cookMinutes: null, budget: null };

/** What a brand-new user (no sessions, nothing set) sees: Cook's stable answers
 *  all unanswered. */
export function baseDefaults(profile: ProfileCookDefaults = NO_PROFILE_DEFAULTS): FormDefaults {
  return {
    mode: "cook",
    cook: {
      decision_mode: "cook",
      cook_minutes: profile.cookMinutes,
      hunger: "normal",
      effort: null,
      shopping: null,
      craving: null,
      ingredients_on_hand: [],
      budget_override_usd: profile.budget,
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
    budgetUsual: profile.budget !== null ? { value: profile.budget, source: "profile" } : null,
    remembered: { cook: false, order: false, store_snack: false },
  };
}

/** `contexts` are raw stored contexts, newest first. Anything unreadable is
 *  skipped rather than trusted. */
export function rememberedDefaults(contexts: readonly unknown[], profile: ProfileCookDefaults = NO_PROFILE_DEFAULTS): FormDefaults {
  const defaults = baseDefaults(profile);
  const parsed: DecisionContext[] = [];
  for (const raw of contexts) {
    const result = parseStoredContext(raw);
    if (result.success) parsed.push(result.data);
  }

  // A cross-way ("open") request has no questions of its own to remember, so it is
  // never what Home opens on: the most recent single-mode request is.
  const lastSingle = parsed.find((c) => c.decision_mode !== "open");
  if (lastSingle) defaults.mode = lastSingle.decision_mode as DecisionMode;

  const cook = parsed.find((c): c is MealContext => c.decision_mode === "cook");
  if (cook) {
    defaults.remembered.cook = true;
    defaults.cook.hunger = cook.hunger;
    defaults.cook.effort = cook.effort;
    defaults.cook.shopping = cook.shopping;
    // The Profile's explicit time wins; otherwise what they actually chose.
    defaults.cook.cook_minutes = profile.cookMinutes ?? cook.cook_minutes;
  }
  // A budget only means something when shopping is allowed, so it comes from
  // the latest such session — a "Use what I have" session carries none. A null
  // override on an old session meant "the profile's" and says nothing itself.
  const shopped = parsed.find(
    (c): c is MealContext => c.decision_mode === "cook" && c.shopping === "can_buy" && c.budget_override_usd !== null,
  );
  if (profile.budget === null && shopped?.budget_override_usd != null) {
    defaults.budgetUsual = { value: shopped.budget_override_usd, source: "last_time" };
    defaults.cook.budget_override_usd = shopped.budget_override_usd;
  }

  const order = parsed.find((c): c is OrderContext => c.decision_mode === "order");
  if (order) {
    defaults.remembered.order = true;
    defaults.order.hunger = order.hunger;
    defaults.order.method = order.method;
    defaults.order.meal_budget = order.meal_budget;
  }
  // Travel is only asked for Eat nearby and Pickup, so only such a session
  // can say anything about it — never a delivery one.
  const nearby = parsed.find((c): c is OrderContext => c.decision_mode === "order" && asksTravel(c.method));
  if (nearby) defaults.order.travel_willingness = nearby.travel_willingness;

  const snack = parsed.find((c): c is StoreSnackContext => c.decision_mode === "store_snack");
  if (snack) {
    defaults.remembered.store_snack = true;
    defaults.store_snack.hunger = snack.hunger;
  }

  return defaults;
}
