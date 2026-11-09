// One sentence about the user's situation, read into the app's EXISTING answer
// vocabulary — nothing new. This is not a chat: a message goes in, a record of
// fields comes out, and the cards that follow come from the normal pipeline.
//
// The record only ever holds what the person clearly SAID. A field they did not
// mention is null/empty — never a typical value, never a guess — because an
// invented ingredient, budget or place would flow straight into a
// recommendation. The model's output is untrusted too: every field is checked
// against a closed vocabulary here, and anything outside it becomes "not said"
// rather than failing the whole read.

import { z } from "zod";
import { MEAL_BUDGETS, ORDER_CRAVINGS, ORDER_METHODS, STORE_SNACK_CRAVINGS, TRAVEL_OPTIONS } from "@/lib/options";
import type { CravingType, MealBudget, OrderCravingCategory, OrderMethod, TravelWillingness } from "@/lib/types";

/** The longest message accepted — client and server, so neither can be pushed
 *  past what one short sentence needs. */
export const INTERPRET_MAX_CHARS = 400;
export const MAX_FOODS = 12;

const enumOf = <T extends string>(list: readonly { value: T }[]) => z.enum(list.map((o) => o.value) as [T, ...T[]]);

/** A food or craving as the recommender may see it: short, one line, letters
 *  numbers and light punctuation only. The text came from a person's sentence
 *  through a model, so nothing that could carry an instruction survives — no
 *  newlines, brackets, quotes or symbols. */
export function cleanPhrase(raw: string, max: number): string | null {
  const cleaned = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\p{L}\p{N} '&\-.,/%]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

const phrase = (max: number) =>
  z
    .string()
    .transform((s) => cleanPhrase(s, max))
    .nullable()
    .catch(null);

const foods = z
  .array(z.unknown())
  .catch([])
  .transform((items) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      // One odd entry costs only itself, never the whole list.
      const cleaned = typeof item === "string" ? cleanPhrase(item, 40) : null;
      if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
      seen.add(cleaned.toLowerCase());
      out.push(cleaned);
      if (out.length >= MAX_FOODS) break;
    }
    return out;
  });

const number = (min: number, max: number) =>
  z
    .number()
    .transform((n) => Math.round(n))
    .pipe(z.number().int().min(min).max(max))
    .nullable()
    .catch(null);

/** Every field optional: omitted, null, or invalid all mean "not said". */
export const interpretationSchema = z.object({
  mode: z.enum(["cook", "order", "store_snack"]).nullable().catch(null).default(null),
  hunger: z.enum(["light", "normal", "very_hungry"]).nullable().catch(null).default(null),
  minutes: number(5, 180).default(null),
  effort: z.enum(["minimal", "some", "happy_to_cook"]).nullable().catch(null).default(null),
  shopping: z.enum(["inventory_only", "can_buy"]).nullable().catch(null).default(null),
  foods: foods.default([]),
  extra_spend_usd: number(0, 100).default(null),
  meal_budget: enumOf<MealBudget>(MEAL_BUDGETS).nullable().catch(null).default(null),
  method: enumOf<OrderMethod>(ORDER_METHODS).nullable().catch(null).default(null),
  distance: enumOf<TravelWillingness>(TRAVEL_OPTIONS).nullable().catch(null).default(null),
  craving: phrase(60).default(null),
  craving_category: enumOf<OrderCravingCategory>(ORDER_CRAVINGS).nullable().catch(null).default(null),
  snack_craving: enumOf<CravingType>(STORE_SNACK_CRAVINGS).nullable().catch(null).default(null),
  // Which ways of eating the person said are fine. Both = "I can buy things or make
  // something"; ["buy"] = they ruled out cooking. A person who allows ONLY cooking is a
  // single-mode Cook request (mode "cook"), not this. Empty = they said nothing about it.
  ways: z.array(z.enum(["cook", "buy"])).catch([]).default([]).transform((w) => [...new Set(w)]),
  // They left it to us: "anything is fine", "you decide", "just something".
  leave_to_us: z.boolean().nullable().catch(null).default(null),
  // Situation they SAID — context for the recommendation, never a measurement.
  after_exercise: z.boolean().nullable().catch(null).default(null),
  protein_focus: z.boolean().nullable().catch(null).default(null),
  // What KIND of eating, apart from HOW they get it: a proper meal, or just a snack. A meal can be
  // cooked or bought; cooking is not "a meal", and a meal is not "cooking".
  meal_type: z.enum(["meal", "snack"]).nullable().catch(null).default(null),
  // Conditions the person said to DROP ("no time limit now", "forget the budget", "I don't mind how far").
  // Only ever filled when they said so — an unmentioned condition is never cleared.
  clear: z
    .array(z.unknown())
    .catch([])
    .transform((items) => [...new Set(items.filter((x): x is Clearable => typeof x === "string" && (CLEARABLE as readonly string[]).includes(x)))]),
});

export const CLEARABLE = ["minutes", "effort", "budget", "foods", "craving", "distance"] as const;
export type Clearable = (typeof CLEARABLE)[number];

/** The way an existing request is currently being made — all the reader is told about it. No answers, no text. */
export const ADJUSTING_WAYS = ["cook", "order", "store_snack", "open"] as const;
export type AdjustingWay = (typeof ADJUSTING_WAYS)[number];
export function parseAdjusting(raw: unknown): AdjustingWay | null {
  return typeof raw === "string" && (ADJUSTING_WAYS as readonly string[]).includes(raw) ? (raw as AdjustingWay) : null;
}

export type Interpretation = z.infer<typeof interpretationSchema>;

/** The model's tool input (or anything else) → a clean record. Never throws:
 *  non-objects read as "nothing said". */
export function parseInterpretation(raw: unknown): Interpretation {
  return interpretationSchema.parse(typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {});
}

/** True when nothing usable was picked up — treated as a failed read, so the
 *  person keeps their text and is offered the step-by-step path. */
export function isEmptyInterpretation(i: Interpretation): boolean {
  return (
    i.mode === null &&
    i.hunger === null &&
    i.minutes === null &&
    i.effort === null &&
    i.shopping === null &&
    i.foods.length === 0 &&
    i.extra_spend_usd === null &&
    i.meal_budget === null &&
    i.method === null &&
    i.distance === null &&
    i.craving === null &&
    i.craving_category === null &&
    i.snack_craving === null &&
    i.ways.length === 0 &&
    i.leave_to_us !== true &&
    i.after_exercise !== true &&
    i.protein_focus !== true &&
    !i.meal_type &&
    (i.clear ?? []).length === 0
  );
}

/** What a message may be: trimmed, 1..INTERPRET_MAX_CHARS. */
export function validateInterpretText(raw: unknown): { ok: true; text: string } | { ok: false; reason: "empty" | "too_long" } {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > INTERPRET_MAX_CHARS) return { ok: false, reason: "too_long" };
  return { ok: true, text };
}

/** What the route can answer instead of a record. */
export type InterpretErrorCode =
  | "unauthenticated"
  | "empty"
  | "too_long"
  | "not_configured"
  | "nothing_found"
  | "unavailable"
  | "timeout"
  | "limit_reached"
  /** Switched off by the owner, or the whole beta is out of today's capacity. */
  | "paused";
