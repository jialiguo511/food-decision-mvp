// Who said so: which stored Profile values the USER actually set.
//
// Why this exists. Five Profile fields have a database default (goal, budget,
// cook minutes, fridge size, equipment) — the column is NOT NULL, so a row that
// was never touched still "has" a value. Reading that value back as a
// preference invents one: a brand-new user was shown "My usual — About $12",
// "Usual time to cook 30 min", and was assumed to own a microwave, none of
// which they ever said. So the stored value alone proves nothing.
//
// The rule is one list, `prefs.explicit_fields`, naming the fields the user has
// set. A field not in it reads as null ("Not set") no matter what the column
// holds. Writing a field adds it; clearing one removes it (the column keeps
// its stale value, which is simply never read). No schema change.
//
// Three sources of a value, never confused:
//   1. explicit  — the user set it (this list).
//   2. remembered — it came from a real earlier session (rememberedDefaults).
//   3. fallback  — the system needed a number (SYSTEM_FALLBACKS); never shown,
//                  never stored.
//
// Rows written before this existed have no list. For those, a stored value
// counts as explicit only when it differs from what an untouched row would have
// held — a value that equals the old default is indistinguishable from "never
// chosen", and the safe reading is "not set".

import { FRIDGE_SIZES, GOALS } from "./options";
import type { FridgeSize, Goal } from "./types";

export const EXPLICIT_PREF = "explicit_fields";

export const MANAGED_FIELDS = ["goal", "budget_per_meal_usd", "default_cook_minutes", "fridge_size", "equipment"] as const;
export type ManagedField = (typeof MANAGED_FIELDS)[number];

/** What an untouched row used to hold for each field (the old DEFAULT_PROFILE
 *  and the database defaults) — only used to read pre-provenance rows. */
const LEGACY_UNCHOSEN: Record<ManagedField, unknown> = {
  goal: "general_health",
  budget_per_meal_usd: 12,
  default_cook_minutes: 30,
  fridge_size: "standard",
  equipment: ["Stovetop", "Microwave"],
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function sameSet(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** The fields of a `profiles` row (or null) the user has set. */
export function explicitFields(row: unknown): Set<ManagedField> {
  if (!isRecord(row)) return new Set();
  const prefs = row.prefs;
  const listed = isRecord(prefs) ? prefs[EXPLICIT_PREF] : undefined;
  if (Array.isArray(listed)) {
    return new Set(MANAGED_FIELDS.filter((field) => listed.includes(field)));
  }
  // Legacy row: a value is the user's only if it isn't the untouched default.
  const set = new Set<ManagedField>();
  for (const field of MANAGED_FIELDS) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    const unchosen = LEGACY_UNCHOSEN[field];
    const same = Array.isArray(unchosen) ? sameSet(value, unchosen) : field === "budget_per_meal_usd" || field === "default_cook_minutes" ? Number(value) === unchosen : value === unchosen;
    const empty = Array.isArray(value) && value.length === 0;
    if (!same && !empty) set.add(field);
  }
  return set;
}

export const isGoal = (v: unknown): v is Goal => GOALS.some((g) => g.value === v);
export const isFridge = (v: unknown): v is FridgeSize => FRIDGE_SIZES.some((f) => f.value === v);
