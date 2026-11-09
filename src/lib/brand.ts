// The product's public name and one-line description — ONE place, so the tab
// title, the home-screen name, the web manifest, the sign-in page and the
// About page can't drift apart (they used to say three different things:
// "Food Decision", "Nutrition Coach", and "What should I eat?").
//
// The working name matches what the app actually asks, and is deliberately NOT
// "coach": the product is a food DECISION assistant, not a nutrition coach
// (PRODUCT.md → "Product identity and guardrails"). It is a placeholder until
// the founder chooses a final name — changing it here changes it everywhere.

export const BRAND = {
  /** Browser tab, manifest name, sign-in page. */
  name: "What Should I Eat",
  /** Under the icon on a phone's home screen (short labels get cut off). */
  short: "What to Eat",
  /** The release stage, shown on the sign-in page, Me and About. Public beta = anyone can sign up; it is
   *  not "finished". Change it here when the stage changes. */
  stage: "Public Beta",
  /** What it does, in one sentence. */
  tagline: "Three meal ideas for right now, fitted to your real constraints.",
} as const;
