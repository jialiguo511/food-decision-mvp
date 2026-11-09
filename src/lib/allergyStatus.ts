// "No known allergies" and "never told us" are different facts, and an empty list
// can't tell them apart. profiles.allergies is [] for a person with no allergies AND
// for a person who skipped the question — and the app must not treat the second as
// the first (it would read as "confirmed safe" about something nobody confirmed).
//
// So the Profile records, in prefs (no schema change), that the person has ADDRESSED
// allergies at least once — by listing some, or by saying there are none:
//
//   listed      allergies has entries          → a hard constraint, as ever
//   none_known  the person said "none", or listed some earlier and has since cleared them
//   not_set     never addressed (a new account, or setup skipped)
//
// "not_set" changes nothing about what is recommended (an empty list is still an empty
// list, and the app still never calls anything allergen-free). What it changes is what
// the app SAYS: it doesn't pretend to know, and it offers one tap to tell it.

/** prefs key: an ISO timestamp, set when the person lists an allergy or confirms there are none. */
export const ALLERGIES_PREF = "allergies_addressed_at";

export type AllergyStatus = "listed" | "none_known" | "not_set";

export function allergyStatus(row: unknown): AllergyStatus {
  if (row === null || row === undefined || typeof row !== "object" || Array.isArray(row)) return "not_set";
  // Read straight off the row (not via profile.ts, which imports this file's constant).
  const listed = (row as { allergies?: unknown }).allergies;
  if (Array.isArray(listed) && listed.some((a) => typeof a === "string" && a.trim() !== "")) return "listed";
  const prefs = (row as { prefs?: unknown }).prefs;
  return prefs && typeof prefs === "object" && !Array.isArray(prefs) && ALLERGIES_PREF in prefs ? "none_known" : "not_set";
}
