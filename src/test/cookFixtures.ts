import type { MealContext } from "@/lib/types";

/** A complete Cook request. Every answer is stated, so a test never leans on a
 *  fallback — see CookForm for why production forms can be incomplete. */
export const cookContext = (o: Partial<MealContext> = {}): MealContext => ({
  decision_mode: "cook",
  cook_minutes: 30,
  hunger: "normal",
  effort: "some",
  shopping: "can_buy",
  craving: null,
  ingredients_on_hand: [],
  budget_override_usd: 12,
  ...o,
});
