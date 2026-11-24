// What a person hasn't told Me yet that would change their suggestions — for one quiet, optional
// card at the top of Me. Never a gate, never on Home's decision path, never a score or a streak.
// Each item names what it changes (PRODUCT.md principle 9), and an item the person already
// declined (the nutrition step "Not now") is not asked again.

import { allergyStatus } from "./allergyStatus";
import { offersNutritionStep } from "./onboarding";
import { toProfileFormValues } from "./profile";

export type ProfileGap = { key: "allergies" | "equipment" | "staples" | "body"; label: string; why: string; href: string };

export function profileGaps(row: unknown, staplesCount: number): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (allergyStatus(row) === "not_set") {
    gaps.push({ key: "allergies", label: "Allergies", why: "so we never suggest something you can't eat", href: "#food-preferences" });
  }
  if (toProfileFormValues(row).equipment === null) {
    gaps.push({ key: "equipment", label: "What you can cook with", why: "so recipes only use what you have", href: "#kitchen-basics" });
  }
  if (staplesCount === 0) {
    gaps.push({ key: "staples", label: "Kitchen staples", why: "so recipes can use your oil, spices and sauces", href: "#kitchen-basics" });
  }
  if (offersNutritionStep(row)) {
    gaps.push({ key: "body", label: "A few body basics", why: "for portion and protein estimates sized to you", href: "#my-goals" });
  }
  return gaps;
}
