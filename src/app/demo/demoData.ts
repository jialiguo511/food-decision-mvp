// Hand-written example outcomes for the public /demo page. NOTHING here is
// generated, personal, or live: no model, no database, no account, no request.
// They exist so a visitor can see what the product does without waiting for a
// sign-in link, and every card on the page is labelled as an example.
//
// Written to follow the product's own rules, so the example doesn't flatter it:
// "Use what I have" cards use only the foods named plus Kitchen staples (salt,
// oil, soy sauce); the Eat out example is food ideas by type, not named
// restaurants (a real place can't be shown honestly without a live search); all
// numbers carry "~".

import type { Understood } from "@/app/today/flow/interpret";

export type DemoCard = {
  role: "Best match" | "Lowest effort" | "Something different" | "Top pick" | "Easy to order" | "Best fit" | "Most satisfying" | "Lighter option";
  title: string;
  pills: string[];
  reason: string;
  /** The one practical line under the reason (what to search for / look for). */
  detail?: { label: string; text: string };
};

export type DemoScenario = {
  id: string;
  /** The tab label — the kind of help. */
  label: string;
  understood: Understood;
  heading: string;
  cards: DemoCard[];
  /** What the example is showing off. */
  note: string;
};

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "cook",
    label: "Make something",
    heading: "Here's what to make",
    understood: {
      text: "Just trained, very hungry, 20 minutes, I have eggs and rice.",
      parts: [
        { text: "Starving", said: true },
        { text: "20 min", said: true },
        { text: "A little effort", said: true },
        { text: "Use what I have", said: true },
      ],
      foods: ["eggs", "rice"],
      craving: null,
    },
    note: "It asked two quick follow-ups (how much effort, and whether you'd shop) — only what the sentence didn't say. Only eggs, rice and kitchen staples (oil, soy sauce, salt) appear.",
    cards: [
      {
        role: "Best match",
        title: "Egg fried rice",
        pills: ["~15 min", "~540 cal", "~26g protein", "Nothing to buy"],
        reason: "Uses both things you have, cooks in one pan, and the eggs and rice give you protein and carbs after training.",
      },
      {
        role: "Lowest effort",
        title: "Soft scrambled eggs over rice",
        pills: ["~8 min", "~460 cal", "~22g protein", "Nothing to buy"],
        reason: "Warm rice, eggs scrambled low and slow, a splash of soy sauce. The least you can do and still eat well.",
      },
      {
        role: "Something different",
        title: "Rice omelette",
        pills: ["~15 min", "~500 cal", "~25g protein", "Nothing to buy"],
        reason: "The same two foods, different texture: rice pan-crisped, folded into a thin omelette.",
      },
    ],
  },
  {
    id: "order",
    label: "Get food",
    heading: "Here's what to get",
    understood: {
      text: "Tired and don't want to cook. Order something, around $15.",
      parts: [
        { text: "Normal hunger", said: false },
        { text: "Delivery", said: true },
        { text: "Under $15", said: true },
      ],
      foods: [],
      craving: null,
    },
    note: "The dotted chip wasn't in the sentence — it came from a default. For real nearby places the app searches live; this example sticks to ideas by type.",
    cards: [
      {
        role: "Top pick",
        title: "Chicken burrito bowl",
        pills: ["~650 cal", "~40g protein"],
        reason: "Filling, protein-forward, and usually well under your budget.",
        detail: { label: "Search for", text: "chicken burrito bowl · rice and beans bowl" },
      },
      {
        role: "Easy to order",
        title: "Teriyaki chicken rice bowl",
        pills: ["~600 cal", "~35g protein"],
        reason: "Available almost everywhere and quick to arrive.",
        detail: { label: "Search for", text: "teriyaki chicken bowl · chicken and rice" },
      },
      {
        role: "Something different",
        title: "Poke bowl",
        pills: ["~550 cal", "~32g protein"],
        reason: "Lighter and fresher if you'd rather not have something heavy.",
        detail: { label: "Search for", text: "salmon poke bowl · tuna poke" },
      },
    ],
  },
  {
    id: "snack",
    label: "Grab a snack",
    heading: "Snacks to grab",
    understood: {
      text: "Want something sweet that I can grab right now.",
      parts: [
        { text: "Normal hunger", said: false },
        { text: "Sweet", said: true },
      ],
      foods: [],
      craving: null,
    },
    note: "A snack needs no follow-up questions.",
    cards: [
      {
        role: "Best fit",
        title: "Greek yogurt with honey",
        pills: ["~200 cal", "~15g protein"],
        reason: "Sweet, but with protein so it holds you for longer.",
        detail: { label: "Look for", text: "plain or vanilla Greek yogurt, a honey packet or a drizzle bottle" },
      },
      {
        role: "Most satisfying",
        title: "Dark chocolate and nuts",
        pills: ["~250 cal", "~6g protein"],
        reason: "A small, rich square scratches the itch without a large portion.",
        detail: { label: "Look for", text: "70% cacao bar, a small bag of almonds or peanuts" },
      },
      {
        role: "Lighter option",
        title: "Fruit and a small cookie",
        pills: ["~150 cal", "~2g protein"],
        reason: "Sweet and light if you only want a little.",
        detail: { label: "Look for", text: "a banana, apple or grapes, plus one bakery cookie" },
      },
    ],
  },
];
