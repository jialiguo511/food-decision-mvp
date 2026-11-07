// Lightweight behavioral hints: a tiny, bounded summary of what the user has
// recently chosen, handed to the recommender as the LOWEST-priority context.
// Rules-based counting over existing rows — no model, no stored inference, no
// new table. Everything here is a current hypothesis (PERSONALIZATION.md →
// Behavioral memory), a soft tie-breaker and never a filter.
//
// Deliberately narrow. It reads only what is explicitly represented in the
// data: the chosen card's role, title and (nearby) provider category, plus
// whether the user recorded NOT eating it. It has no cuisine/protein field to
// read, so it infers none — and its input type has no place for
// `ingredients_on_hand` or a craving, so those can never become long-term
// memory. Each mode is its own scope; nothing crosses between them.

import type { RecommendationRole } from "../types";

export type BehaviorScope = "cook" | "order" | "store_snack" | "nearby";

/** One chosen session, reduced to what this file is allowed to see. */
export type ChosenRow = {
  /** ISO timestamp of the decision_sessions row. */
  created_at: string;
  scope: BehaviorScope;
  /** The chosen card's fields — null when unreadable. */
  role: RecommendationRole | null;
  title: string | null;
  /** Provider type label, nearby only ("Thai restaurant"). */
  category: string | null;
  /** meal_feedback.did_eat for that session; null = nothing recorded. */
  didEat: boolean | null;
};

export type BehaviorHints = {
  /** Titles of dishes picked lately, newest first. For VARIETY only — so the
   *  same dish isn't re-offered needlessly. Never a taste signal. Absent for
   *  nearby (revisiting a place is normal). */
  recent_choices?: string[];
  /** Tentative, human-readable patterns with their counts. */
  leans: string[];
};

/** Bounded recent history: look at this many of the newest meaningful choices. */
export const WINDOW = 25;
/** Below this many meaningful choices in a scope, or on fewer distinct days,
 *  there are no hints at all — history is too sparse to say anything. */
export const MIN_CHOICES = 4;
export const MIN_DAYS = 2;
/** A lean needs this many picks across at least MIN_DAYS days, and this share
 *  of the window — one or two picks never count. */
export const LEAN_MIN_COUNT = 3;
export const ROLE_LEAN_MIN_SHARE = 0.6;
export const CATEGORY_LEAN_MIN_SHARE = 0.5;
const RECENT_CHOICES_MAX = 6;

/** Rows are newest first. Returns null when there is nothing safe to say. */
export function summarizeBehavior(rows: readonly ChosenRow[], scope: BehaviorScope): BehaviorHints | null {
  // Picked and not recorded as "didn't eat". An ambiguous not-eaten outcome is
  // treated as circumstance, not taste (PERSONALIZATION.md rule 7), so it
  // simply isn't counted as a positive.
  const meaningful = rows.filter((r) => r.scope === scope && r.didEat !== false).slice(0, WINDOW);
  if (meaningful.length < MIN_CHOICES || distinctDays(meaningful) < MIN_DAYS) return null;

  const leans: string[] = [];
  const total = meaningful.length;

  // "Lowest effort" means "easiest" only in cook and order. In snack mode the
  // same role means "more indulgent", and nearby has no effort notion, so a
  // lean there would be nonsense.
  if (scope === "cook" || scope === "order") {
    const easy = meaningful.filter((r) => r.role === "lowest_effort");
    if (easy.length >= LEAN_MIN_COUNT && distinctDays(easy) >= MIN_DAYS && easy.length / total >= ROLE_LEAN_MIN_SHARE) {
      leans.push(`Often picks the easiest option (${easy.length} of their last ${total} choices).`);
    }
  }

  if (scope === "nearby") {
    const byCategory = new Map<string, ChosenRow[]>();
    for (const r of meaningful) {
      const key = r.category?.trim().toLowerCase();
      if (!key) continue;
      byCategory.set(key, [...(byCategory.get(key) ?? []), r]);
    }
    const top = [...byCategory.values()].sort((a, b) => b.length - a.length)[0];
    if (top && top.length >= LEAN_MIN_COUNT && distinctDays(top) >= MIN_DAYS && top.length / total >= CATEGORY_LEAN_MIN_SHARE) {
      leans.push(`Has often chosen "${top[0].category?.trim()}" places (${top.length} of their last ${total} choices).`);
    }
  }

  const recent = scope === "nearby" ? [] : uniqueTitles(meaningful).slice(0, RECENT_CHOICES_MAX);
  if (recent.length === 0 && leans.length === 0) return null;
  return { ...(recent.length > 0 ? { recent_choices: recent } : {}), leans };
}

/** Distinct calendar days (UTC) — three picks from one evening's regenerations
 *  are one occasion, not three. */
function distinctDays(rows: readonly ChosenRow[]): number {
  return new Set(rows.map((r) => r.created_at.slice(0, 10))).size;
}

function uniqueTitles(rows: readonly ChosenRow[]): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const r of rows) {
    const title = r.title?.trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    titles.push(title);
  }
  return titles;
}
