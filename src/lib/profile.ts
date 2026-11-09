// Reading, resolving, and validating the Profile — one place, so the Profile
// page, the save action, and the recommender can't disagree about what a row
// means.
//
// Three shapes of the same data (see types.ts):
//   row (database) → ProfileFormValues (raw, editable) → ProfileInput
//   (resolved targets, what the recommender reads).
// Old rows with missing columns are fine: every new field reads as "not set".

import { ALLERGIES_PREF } from "./allergyStatus";
import {
  ACTIVITY_LEVELS,
  CALORIE_TARGET,
  COMMON_ALLERGIES,
  COMMON_DISLIKES,
  DEFAULT_PROTEIN_TARGET_G,
  DIETARY_PATTERNS,
  EQUIPMENT,
  FRIDGE_SIZES,
  GOALS,
  SEXES,
  SYSTEM_FALLBACKS,
} from "./options";
import { EXPLICIT_PREF, explicitFields, MANAGED_FIELDS, type ManagedField } from "./profileProvenance";
import { normalizeFoodLists } from "./foodTerms";
import { sanitizeConditions, sanitizePriorities } from "./nutritionPriorities";
import { BODY_LIMITS, calculateNutritionTargets, round1 } from "./nutrition";
import type { ActivityLevel, DietaryPattern, ProfileFormValues, ProfileInput, Sex } from "./types";

/** A brand-new user's form: nothing set. Every field the database would fill in
 *  by default is null here ("Not set") — see lib/profileProvenance.ts. */
export const DEFAULT_FORM_VALUES: ProfileFormValues = {
  display_name: null,
  goal: null,
  protein_target_g: null,
  daily_calorie_target_kcal: null,
  budget_per_meal_usd: null,
  fridge_size: null,
  default_cook_minutes: null,
  cuisines: [],
  dislikes: [],
  allergies: [],
  health_conditions: [],
  nutrition_priorities: [],
  equipment: null,
  dietary_patterns: [],
  dietary_other: null,
  sex: null,
  age_years: null,
  height_cm: null,
  weight_kg: null,
  activity_level: null,
};

/** A `profiles` row (or null for a user who has never saved) as form values.
 *  Anything missing or out of vocabulary falls back to defaults / "not set". */
export function toProfileFormValues(row: unknown): ProfileFormValues {
  if (!isRecord(row)) return { ...DEFAULT_FORM_VALUES };
  const explicit = explicitFields(row);
  const prefs = isRecord(row.prefs) ? row.prefs : {};
  const dietary = isRecord(prefs.dietary) ? prefs.dietary : {};
  const equipment = strings(row.equipment).filter((item) => (EQUIPMENT as readonly string[]).includes(item));
  return {
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    goal: explicit.has("goal") ? pickOrNull(row.goal, GOALS.map((g) => g.value)) : null,
    // A stored number is a manual value — including every pre-existing row,
    // which never distinguished "chose 120" from "left the default".
    protein_target_g: optionalNumber(row.protein_target_g),
    daily_calorie_target_kcal: optionalInteger(row.daily_calorie_target_kcal),
    // numeric(6,2) arrives from PostgREST as a string.
    // 0 is a real budget ("nothing extra"), so only a missing/garbage value is null.
    budget_per_meal_usd: explicit.has("budget_per_meal_usd") ? nonNegative(row.budget_per_meal_usd) : null,
    fridge_size: explicit.has("fridge_size") ? pickOrNull(row.fridge_size, FRIDGE_SIZES.map((f) => f.value)) : null,
    default_cook_minutes: explicit.has("default_cook_minutes") ? optionalNumber(row.default_cook_minutes) : null,
    cuisines: strings(row.cuisines),
    dislikes: strings(row.dislikes),
    allergies: strings(row.allergies),
    health_conditions: sanitizeConditions(row.health_conditions),
    nutrition_priorities: sanitizePriorities(row.nutrition_priorities),
    // [] and "never answered" are the same thing: unknown, not "no appliances".
    equipment: explicit.has("equipment") && equipment.length > 0 ? equipment : null,
    dietary_patterns: strings(dietary.patterns).filter((p): p is DietaryPattern => DIETARY_PATTERNS.some((d) => d.value === p)),
    dietary_other: typeof dietary.other === "string" && dietary.other.trim() ? dietary.other.trim().slice(0, 80) : null,
    sex: pickOrNull(row.sex, SEXES.map((s) => s.value)),
    age_years: optionalNumber(row.age_years),
    height_cm: optionalNumber(row.height_cm),
    weight_kg: optionalNumber(row.weight_kg),
    activity_level: pickOrNull(row.activity_level, ACTIVITY_LEVELS.map((a) => a.value)),
  };
}

/** The targets the recommender should use: the user's manual value if they set
 *  one, else the calculated suggestion, else today's behavior (120 g protein;
 *  no calorie target, i.e. qualitative guidance). A suggestion only ever
 *  exists when every required input is present — nothing is fabricated. */
export function resolveProfile(form: ProfileFormValues): ProfileInput {
  const targets = calculateNutritionTargets(form, DEFAULT_PROTEIN_TARGET_G);
  return {
    display_name: form.display_name,
    goal: targets.goal,
    protein_target_g: targets.protein.target,
    daily_calorie_target_kcal: targets.calories?.target ?? null,
    budget_per_meal_usd: form.budget_per_meal_usd,
    fridge_size: form.fridge_size,
    default_cook_minutes: form.default_cook_minutes,
    cuisines: form.cuisines,
    dislikes: form.dislikes,
    allergies: form.allergies,
    // Confirmed priorities only — conditions never reach the recommender.
    nutrition_priorities: form.nutrition_priorities,
    equipment: form.equipment,
    dietary_patterns: form.dietary_patterns,
    dietary_other: form.dietary_other,
  };
}

/** The goal the estimates and the recommender use: the user's, else the
 *  neutral internal fallback. Never shown as the user's choice. */
export function goalOrDefault(goal: ProfileFormValues["goal"]) {
  return goal ?? SYSTEM_FALLBACKS.goal;
}

/** A `profiles` row as the recommender's ProfileInput. */
export function toProfileInput(row: unknown): ProfileInput {
  return resolveProfile(toProfileFormValues(row));
}

export type ValidatedProfile =
  | {
      ok: true;
      /** Columns to write. A field the user hasn't set is ABSENT, never a
       *  fallback: the database default fills it on first insert and an
       *  existing value is left alone (and ignored — see profileProvenance). */
      row: Record<string, unknown>;
      /** What belongs in profiles.prefs for this save: which managed fields
       *  are the user's, and the dietary pattern. Merge over the existing
       *  prefs with mergeProfilePrefs. */
      prefs: { [EXPLICIT_PREF]: ManagedField[]; dietary: { patterns: DietaryPattern[]; other: string | null } };
    }
  | { ok: false; error: string };

/** The prefs object to store: the existing one (other keys preserved) with this
 *  save's provenance and dietary pattern laid over it. */
export function mergeProfilePrefs(existing: unknown, validated: Extract<ValidatedProfile, { ok: true }>, extra: Record<string, unknown> = {}) {
  const base = isRecord(existing) ? existing : {};
  // Listing an allergy is addressing allergies (see lib/allergyStatus.ts). Keep the
  // first time; clearing the list later doesn't un-address it — it reads as "none known".
  const listed = Array.isArray(validated.row.allergies) && validated.row.allergies.length > 0;
  const addressed = listed && !(ALLERGIES_PREF in base) ? { [ALLERGIES_PREF]: new Date().toISOString() } : {};
  return { ...base, ...validated.prefs, ...addressed, ...extra };
}

/** Validates what the browser sent and builds the row to save. Typed numbers
 *  are rejected when out of range rather than clamped — silently saving a
 *  different number would mislead, and a wrong height would skew every
 *  estimate. Allergies and dislikes are normalized and kept disjoint. */
export function validateProfileForm(input: ProfileFormValues): ValidatedProfile {
  const calories = input.daily_calorie_target_kcal;
  if (calories !== null && (!Number.isInteger(calories) || calories < CALORIE_TARGET.min || calories > CALORIE_TARGET.max)) {
    return {
      ok: false,
      error: `Daily calorie target should be between ${CALORIE_TARGET.min.toLocaleString("en-US")} and ${CALORIE_TARGET.max.toLocaleString("en-US")} kcal, or left blank.`,
    };
  }

  const ranges: [keyof typeof BODY_LIMITS, string, string][] = [
    ["age_years", "Age", "years"],
    ["height_cm", "Height", "cm"],
    ["weight_kg", "Weight", "kg"],
  ];
  for (const [key, label, unit] of ranges) {
    const value = input[key];
    const { min, max } = BODY_LIMITS[key];
    if (value !== null && (!Number.isFinite(value) || value < min || value > max)) {
      return {
        ok: false,
        error:
          key === "age_years"
            ? `Estimates are for adults — age should be between ${min} and ${max}, or left blank.`
            : `${label} should be between ${min} and ${max} ${unit}, or left blank.`,
      };
    }
  }
  if (input.sex !== null && !SEXES.some((s) => s.value === input.sex)) return { ok: false, error: "Unrecognized sex option." };
  if (input.activity_level !== null && !ACTIVITY_LEVELS.some((a) => a.value === input.activity_level)) {
    return { ok: false, error: "Unrecognized activity level." };
  }

  const lists = normalizeFoodLists(input.allergies, input.dislikes, { allergies: COMMON_ALLERGIES, dislikes: COMMON_DISLIKES });

  const equipment = input.equipment === null ? [] : dedupe(input.equipment).filter((item) => (EQUIPMENT as readonly string[]).includes(item));
  // Only what the user set. A null is "not set": left out of the row and out of
  // the explicit list, so nothing the system would have filled in is stored as
  // if it were a choice.
  const managed: Record<ManagedField, unknown> = {
    goal: input.goal,
    // 0 is a valid budget — "no additional spending by default".
    budget_per_meal_usd: input.budget_per_meal_usd === null ? null : clamp(input.budget_per_meal_usd, 0, 100),
    fridge_size: input.fridge_size,
    default_cook_minutes: input.default_cook_minutes === null ? null : clamp(input.default_cook_minutes, 5, 180),
    equipment: equipment.length > 0 ? equipment : null,
  };
  const explicit = MANAGED_FIELDS.filter((field) => managed[field] !== null);
  const set = Object.fromEntries(explicit.map((field) => [field, managed[field]]));

  const patterns = Array.from(new Set(input.dietary_patterns.filter((p) => DIETARY_PATTERNS.some((d) => d.value === p))));
  const other = input.dietary_other?.trim().replace(/\s+/g, " ").slice(0, 80) || null;

  return {
    ok: true,
    row: {
      display_name: input.display_name?.trim().slice(0, 60) || null,
      ...set,
      protein_target_g: input.protein_target_g === null ? null : clamp(input.protein_target_g, 40, 300),
      daily_calorie_target_kcal: calories,
      cuisines: dedupe(input.cuisines),
      allergies: lists.allergies,
      dislikes: lists.dislikes,
      health_conditions: sanitizeConditions(input.health_conditions),
      nutrition_priorities: sanitizePriorities(input.nutrition_priorities),
      sex: input.sex as Sex | null,
      age_years: input.age_years === null ? null : Math.round(input.age_years),
      height_cm: input.height_cm === null ? null : round1(input.height_cm),
      weight_kg: input.weight_kg === null ? null : round1(input.weight_kg),
      activity_level: input.activity_level as ActivityLevel | null,
    },
    prefs: { [EXPLICIT_PREF]: explicit, dietary: { patterns, other } },
  };
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Free-form list entries (cuisines…): trimmed, one short line each, at most 40 — the prompt and the
 *  database are not places for unbounded text. */
function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim().replace(/\s+/g, " ").slice(0, 60).trim()).filter(Boolean))).slice(0, 40);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickOrNull<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((option) => option === value) ?? null;
}

/** null/undefined/garbage/negative → null; 0 and up are real. numeric columns
 *  arrive from PostgREST as strings. */
function nonNegative(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** null/undefined/garbage → null; otherwise a positive number. numeric columns
 *  arrive from PostgREST as strings. */
function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function optionalInteger(value: unknown): number | null {
  const parsed = optionalNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
