// The one model call behind the sentence entry, shared by the route and by the
// real-model check (scripts/interpret-check.ts) so both exercise the SAME prompt,
// tool and settings. Server-only: it needs the API key.

import Anthropic from "@anthropic-ai/sdk";
import { ADJUST_ADDENDUM, buildInterpretMessage, INTERPRET_SYSTEM_PROMPT, INTERPRET_TOOL, INTERPRET_TOOL_SCHEMA } from "./prompt";
import { parseInterpretation, type AdjustingWay, type Interpretation } from "./schema";

/** Same small, fast model as the nearby wording; override with INTERPRET_MODEL. */
export const DEFAULT_INTERPRET_MODEL = "claude-haiku-4-5-20251001";
export const INTERPRET_TIMEOUT_MS = 15_000;

/** Reads one already-validated message. Throws on transport / API failure (the
 *  route turns that into a code); never throws on odd model output — that
 *  becomes "nothing said" via the schema. */
export async function readSituation(text: string, apiKey: string, model = process.env.INTERPRET_MODEL?.trim() || DEFAULT_INTERPRET_MODEL, adjusting: AdjustingWay | null = null): Promise<Interpretation> {
  const client = new Anthropic({ apiKey, timeout: INTERPRET_TIMEOUT_MS, maxRetries: 0 });
  const response = await client.messages.create({
    model,
    max_tokens: 500,
    temperature: 0,
    system: adjusting ? INTERPRET_SYSTEM_PROMPT + ADJUST_ADDENDUM : INTERPRET_SYSTEM_PROMPT,
    tools: [{ name: INTERPRET_TOOL, description: "Record what the person said about their eating situation.", input_schema: INTERPRET_TOOL_SCHEMA }],
    tool_choice: { type: "tool", name: INTERPRET_TOOL },
    messages: [{ role: "user", content: buildInterpretMessage(text, adjusting) }],
  });
  return parseInterpretation(response.content.find((block) => block.type === "tool_use")?.input);
}
