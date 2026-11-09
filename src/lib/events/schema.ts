// The product events — the small, first-party log that says whether the
// "what should I eat?" loop works for real people. Six names, nothing else.
//
// What an event may hold: a name, enumerated values, small numbers. Never the
// sentence a person typed, never a food or craving, never anything from the
// Profile or a health note, never a coordinate or a place. The shape below is
// the whole contract — unknown keys are dropped — and the database repeats the
// limit (a name allow-list and a size cap, supabase/migrations/2026-11-07_*).
//
// Reuse, not a second system: "did they pick one" is decision_sessions.chosen_index,
// "did they eat it" is meal_feedback, and what the events add is what those
// rows can't say — how they started, what failed, what was refused. Queries
// that join them: supabase/metrics.sql.

import { z } from "zod";
import { USAGE_KINDS } from "@/lib/usage/limits";

const mode = z.enum(["cook", "order", "store_snack"]);
/** A request's mode, including the cross-way "open" one (a sentence that allowed more than one way). */
const requestMode = z.enum(["cook", "order", "store_snack", "open"]);
/** How the decision started. "more" is "Show me 3 more" (never a negative signal). */
const entry = z.enum(["sentence", "steps", "again", "more"]);
const smallInt = (max: number) => z.number().int().min(0).max(max);
const code = z.string().regex(/^[a-z_]{1,40}$/);

export const eventSchema = z.discriminatedUnion("name", [
  /** The person chose a way in: sent a sentence, picked a mode, or used "Last time". Browser. */
  z.object({ name: z.literal("entry_selected"), props: z.object({ entry: z.enum(["sentence", "steps", "again"]), mode: mode.optional() }) }),
  /** The sentence was read (or not). Server. */
  z.object({ name: z.literal("interpret_done"), props: z.object({ ok: z.boolean(), code: code.optional(), ms: smallInt(120_000), mode: requestMode.optional(), fields: smallInt(20).optional() }) }),
  /** A sentence left something out, so a short follow-up was shown. Browser. */
  z.object({ name: z.literal("clarify_shown"), props: z.object({ mode: mode.optional(), asked: smallInt(6) }) }),
  /** A request for three suggestions finished — with cards or with a failure. Server. */
  z.object({ name: z.literal("recommend_done"), props: z.object({ mode: requestMode, nearby: z.boolean().optional(), entry: entry.optional(), ok: z.boolean(), code: code.optional(), ms: smallInt(600_000), count: smallInt(3).optional() }) }),
  /** "Choose this". Server. */
  z.object({ name: z.literal("choice_made"), props: z.object({ mode: mode.or(z.literal("nearby")), role: z.enum(["best_match", "lowest_effort", "alternative"]) }) }),
  /** A paid call was refused for today. Server. */
  z.object({ name: z.literal("limit_hit"), props: z.object({ kind: z.enum(USAGE_KINDS as [string, ...string[]]) }) }),
]);

export type ProductEvent = z.infer<typeof eventSchema>;
export type EventName = ProductEvent["name"];

/** The events the browser is allowed to report. Everything else is written by
 *  the server where it happens, so it can't be invented from outside. */
export const CLIENT_EVENT_NAMES = ["entry_selected", "clarify_shown"] as const satisfies readonly EventName[];

export const clientEventSchema = eventSchema.refine((e) => (CLIENT_EVENT_NAMES as readonly string[]).includes(e.name), { message: "not a browser event" });
