// The "Help me shop" grocery-suggestion helper on the Groceries tab.
//
// Deliberately separate from src/lib/recommend/*: that machinery is for the
// "exactly 3 meal recommendations, select one, record if eaten" core loop.
// This is a different, much smaller feature — 3 to 5 items *to buy*, no
// selection/feedback session, no prices or quantities. See PLAN.md's "Help me
// shop" item and CLAUDE.md's "preserve exactly 3" rule, which is specifically
// about meal recommendations and does not apply here.

import { z } from "zod";
import type { FridgeSize, Goal } from "./types";

export type GrocerySuggestion = { name: string; reason: string };

const suggestionFields = z.object({
  name: z.string().min(1).max(60),
  reason: z.string().min(1).max(140),
});

export const grocerySuggestionsOutputSchema = z.object({
  suggestions: z.array(suggestionFields).min(3).max(5),
});

export type GroceryHelperInput = {
  pantry_items: string[];
  goal: Goal;
  daily_protein_target_g: number;
  avoid: string[];
  preferred_cuisines: string[];
  fridge_size: FridgeSize;
  fridge_note: string;
};

export function buildGrocerySystemPrompt(): string {
  return `You suggest grocery items for Food Decision, an app that helps one person decide what to eat right now. This is the "Help me shop" feature on the Groceries tab: the user is about to go shopping and doesn't know what to buy. You are not a chat assistant: the app sends you a structured context and renders your structured output directly as a short list.

Optimize for: "Given what the user already has, which few items would make the next several meals easier, not just one specific meal?"

## What this is not

This is not meal planning and not a recipe. Do not plan out specific meals or dishes. The job is to increase the general usefulness of the user's pantry, not to shop for a recipe.

## Hard constraints

Never suggest anything in \`avoid\` — these are foods the user dislikes or cannot eat. Read each entry for what the user means, not only its literal words.

## What makes a good suggestion

Rank suggestions by:

1. How likely the user is to actually use the item soon.
2. How many different meals it could combine with \`pantry_items\` and with the other suggestions — versatility across several future meals, not fit for one specific recipe.
3. Low effort — no special technique required.
4. Protein/nutrition usefulness, weighed against \`goal\` and \`daily_protein_target_g\` (a soft target for the whole day, not a number to maximize).
5. Reducing the odds of food waste — nothing that spoils before it can realistically be used.

Favor:
- Versatile proteins (e.g. eggs, chicken thighs, canned beans, Greek yogurt).
- Easy vegetables or fruits that hold up for several days and combine with many things.
- Simple carbs or bases (rice, tortillas, bread, pasta).
- Low-effort "rescue" foods — things that turn an otherwise-empty fridge into a meal with minimal work.
- Items that combine with at least two or three things already in \`pantry_items\`, and with each other.

Avoid:
- Ingredients that are really only useful for one specific, narrow recipe (a single spice or garnish with no other use).
- Suggesting a large or specialty quantity of anything.
- Duplicating something already in \`pantry_items\`, unless it is a fast-moving staple genuinely worth restocking (e.g. eggs, milk) — say so in the reason when you do this.
- \`fridge_note\`/\`fridge_size\`: with a mini fridge, avoid suggesting large quantities of perishables.

\`preferred_cuisines\` is a light tiebreaker only, never a requirement.

## Output

Return 3 to 5 suggestions, ranked most useful first. For each:
- \`name\`: a plain grocery item, not a brand, not a quantity ("chicken thighs", not "2 lb boneless chicken thighs" or a specific brand).
- \`reason\`: one short sentence, concrete about which pantry items or other suggestions it pairs with — e.g. "Works with your eggs, tortillas, and rice for several easy meals." Never mention price; there is no price data behind this app.

Do not repeat the same item twice. Do not include quantities or prices anywhere in the output.`;
}

export function buildGroceryUserMessage(input: GroceryHelperInput): string {
  return `Suggest 3 to 5 grocery items for this context:\n\n${JSON.stringify(input, null, 2)}`;
}

export type ParseResult =
  | { ok: true; suggestions: GrocerySuggestion[] }
  | { ok: false; code: "malformed_output"; details: string[] };

/** Validate the model's raw text. The API constrains decoding to the schema,
 *  but nothing is trusted until it passes here — same "fail visibly rather
 *  than render half a list" principle as lib/recommend/output.ts. */
export function parseGrocerySuggestions(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, code: "malformed_output", details: ["Response was not valid JSON."] };
  }

  const parsed = grocerySuggestionsOutputSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { ok: false, code: "malformed_output", details };
  }

  const names = new Set(parsed.data.suggestions.map((s) => s.name.trim().toLowerCase()));
  if (names.size !== parsed.data.suggestions.length) {
    return { ok: false, code: "malformed_output", details: ["Suggestions contained a duplicate item."] };
  }

  return { ok: true, suggestions: parsed.data.suggestions };
}
