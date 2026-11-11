// The few safety sentences the app shows, defined once so the places that show them
// cannot drift apart (and so a test can read them). Plain statements of limits — none
// of them promises safety, accuracy or legal protection.
//
// Where each appears (keep this list true):
//   ALLERGY_*  — first-run allergy question, Me → Allergies, once under the results
//                cards (not on each card), and /about.
//   MEDICAL_NOTE, ACCURACY_NOTE — /about only.

export const ALLERGY_LEAD = "Food allergies?";
export const ALLERGY_REST = "Always check ingredients, labels and cross-contact risks yourself. AI suggestions can miss allergens.";
export const ALLERGY_NOTE = `${ALLERGY_LEAD} ${ALLERGY_REST}`;

export const MEDICAL_NOTE =
  "Suggestions and nutrition estimates are for general information only — not medical advice, diagnosis or treatment. For individual medical or dietary guidance, ask a qualified healthcare professional.";

export const ACCURACY_NOTE = "Prices, place details (hours, distance, price level) and what's in stock can be inaccurate or out of date.";
